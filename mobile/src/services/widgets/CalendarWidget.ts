import {BaseWidget, WidgetData} from "./Widget"
import DisplayFormatter from "@/services/DisplayFormatter"
import * as Calendar from "expo-calendar"
import AsyncStorage from "@react-native-async-storage/async-storage"

const COMPLETED_EVENTS_KEY = "@calendar_completed_events"

interface CalendarEvent {
  title?: string
  start?: string
  end?: string
  timeUntil?: string
  id?: string
  completed?: boolean
}

interface CalendarData extends WidgetData {
  events?: CalendarEvent[]
  output?: string
}

export class CalendarWidget extends BaseWidget {
  id = "calendar"
  name = "Calendar"
  refreshInterval = 300 // 5 minutes

  private currentEventIndex = 0
  private cachedEvents: CalendarEvent[] = []
  private autoCycleEnabled = true // Auto-cycle through events
  private autoCycleInterval = 10 // seconds between events
  private autoCycleTimer: any = null
  private completedEventIds: Set<string> = new Set()

  async fetchData(): Promise<CalendarData> {
    // Temporarily suppress console.log during calendar fetch
    const originalLog = console.log
    console.log = () => {}

    try {
      // Load completed events from storage
      const completedJson = await AsyncStorage.getItem(COMPLETED_EVENTS_KEY)
      if (completedJson) {
        this.completedEventIds = new Set(JSON.parse(completedJson))
      }

      // Request calendar permissions
      const {status} = await Calendar.requestCalendarPermissionsAsync()
      if (status !== "granted") {
        console.log = originalLog
        return {output: "Calendar permission denied"}
      }

      // Get today's events
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)

      const endOfDay = new Date()
      endOfDay.setHours(23, 59, 59, 999)

      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)
      const events = await Calendar.getEventsAsync(
        calendars.map((c) => c.id),
        startOfDay,
        endOfDay,
      )

      // Sort by start time
      const sortedEvents = events
        .filter((e) => e.startDate)
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())

      console.log = originalLog

      // Cache events for navigation with completion status
      this.cachedEvents = sortedEvents.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.startDate,
        end: e.endDate,
        completed: this.completedEventIds.has(e.id),
      }))

      // Reset index if out of bounds
      if (this.currentEventIndex >= this.cachedEvents.length) {
        this.currentEventIndex = 0
      }

      return {
        events: this.cachedEvents,
      }
    } catch {
      console.log = originalLog
      // console.error('[CalendarWidget] Error fetching data:', error);
      return {}
    }
  }

  formatDisplay(data: CalendarData): string {
    if (!data.output && (!data.events || data.events.length === 0)) {
      return this.formatEmpty()
    }

    // If we have raw output, parse it
    if (data.output) {
      return this.formatFromOutput(data.output)
    }

    // Otherwise format from structured events
    return this.formatFromEvents(data.events || [])
  }

  private formatEmpty(): string {
    const lines = ["📅 TODAY", "No events scheduled", "", "Free day ahead!", ""]
    return lines.join("\n")
  }

  private formatFromOutput(output: string): string {
    const lines: string[] = []

    // Parse the output to find next event
    const eventMatch = output.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(.+)/)

    if (eventMatch) {
      const time = eventMatch[1]
      const title = eventMatch[2].split("\n")[0].trim()

      lines.push("📅 TODAY")
      lines.push(`${time} - ${DisplayFormatter["truncate"](title, 30)}`)

      // Try to calculate time until
      const now = new Date()
      const eventTime = this.parseTime(time)
      if (eventTime) {
        const diff = eventTime.getTime() - now.getTime()
        const minutes = Math.floor(diff / 60000)
        const hours = Math.floor(minutes / 60)

        if (minutes > 0) {
          if (hours > 0) {
            lines.push(`In ${hours}h ${minutes % 60}m`)
          } else {
            lines.push(`In ${minutes}m`)
          }
        } else {
          lines.push("Now")
        }
      } else {
        lines.push("")
      }

      // Count remaining events
      const eventCount = (output.match(/\d{1,2}:\d{2}\s*[AP]M/g) || []).length
      if (eventCount > 1) {
        lines.push(`${eventCount - 1} more today`)
      } else {
        lines.push("")
      }
    } else {
      return this.formatEmpty()
    }

    // Pad to 5 lines
    while (lines.length < 5) {
      lines.push("")
    }

    return lines.slice(0, 5).join("\n")
  }

  private formatFromEvents(events: CalendarEvent[]): string {
    // Filter out completed events
    const activeEvents = events.filter((e) => !e.completed)

    if (activeEvents.length === 0) {
      const lines = ["📅 TODAY", "", "All events completed! ✓", "", ""]
      return lines.join("\n")
    }

    const lines: string[] = []
    const now = new Date()

    // Adjust index to stay within active events
    if (this.currentEventIndex >= activeEvents.length) {
      this.currentEventIndex = 0
    }

    // Use current index to show specific event
    const currentEvent = activeEvents[this.currentEventIndex] || activeEvents[0]

    // Count completed vs total
    const completedCount = events.filter((e) => e.completed).length
    const totalCount = events.length
    lines.push(`📅 TODAY (${this.currentEventIndex + 1}/${activeEvents.length}) ✓${completedCount}/${totalCount}`)

    // Format event title
    const title = DisplayFormatter["truncate"](currentEvent.title || "Untitled", 37)

    // Format time
    let timeStr = ""
    let timeUntilStr = ""

    if (currentEvent.start) {
      const startDate = new Date(currentEvent.start)
      const endDate = currentEvent.end ? new Date(currentEvent.end) : null

      // Format as "9:00 AM - 10:00 AM" or just "9:00 AM"
      timeStr = this.formatTime(startDate)
      if (endDate) {
        timeStr += ` - ${this.formatTime(endDate)}`
      }

      // Calculate time until
      const diff = startDate.getTime() - now.getTime()
      const minutes = Math.floor(diff / 60000)
      const hours = Math.floor(minutes / 60)

      if (diff < 0 && endDate && endDate > now) {
        timeUntilStr = "Now"
      } else if (minutes > 0) {
        if (hours > 0) {
          timeUntilStr = `In ${hours}h ${minutes % 60}m`
        } else {
          timeUntilStr = `In ${minutes}m`
        }
      } else if (minutes === 0) {
        timeUntilStr = "Starting now"
      } else if (diff < 0) {
        // Past event
        const minutesAgo = Math.abs(minutes)
        const hoursAgo = Math.floor(minutesAgo / 60)
        if (hoursAgo > 0) {
          timeUntilStr = `${hoursAgo}h ${minutesAgo % 60}m ago`
        } else {
          timeUntilStr = `${minutesAgo}m ago`
        }
      }
    }

    lines.push(title)
    lines.push(timeStr)

    if (timeUntilStr) {
      lines.push(timeUntilStr)
    } else {
      lines.push("")
    }

    lines.push("") // Empty line for spacing

    // Pad to 5 lines
    while (lines.length < 5) {
      lines.push("")
    }

    return lines.slice(0, 5).join("\n")
  }

  private formatTime(date: Date): string {
    let hours = date.getHours()
    const minutes = date.getMinutes()
    const ampm = hours >= 12 ? "PM" : "AM"

    hours = hours % 12
    if (hours === 0) hours = 12

    const minuteStr = minutes < 10 ? `0${minutes}` : `${minutes}`
    return `${hours}:${minuteStr} ${ampm}`
  }

  // Navigate to next event
  async next(): Promise<void> {
    if (this.cachedEvents.length === 0) return

    // Only cycle through active (non-completed) events
    const activeEvents = this.cachedEvents.filter((e) => !e.completed)
    if (activeEvents.length === 0) return

    this.currentEventIndex = (this.currentEventIndex + 1) % activeEvents.length
  }

  // Navigate to previous event
  async previous(): Promise<void> {
    if (this.cachedEvents.length === 0) return

    // Only cycle through active (non-completed) events
    const activeEvents = this.cachedEvents.filter((e) => !e.completed)
    if (activeEvents.length === 0) return

    this.currentEventIndex = (this.currentEventIndex - 1 + activeEvents.length) % activeEvents.length
  }

  // Reset to first event
  async reset(): Promise<void> {
    this.currentEventIndex = 0
  }

  // Start auto-cycling through events
  startAutoCycle(callback?: () => void): void {
    if (this.cachedEvents.length <= 1) return // No need to cycle if only 1 event

    this.stopAutoCycle() // Clear any existing timer

    this.autoCycleTimer = setInterval(async () => {
      await this.next()
      if (callback) callback()
    }, this.autoCycleInterval * 1000)
  }

  // Stop auto-cycling
  stopAutoCycle(): void {
    if (this.autoCycleTimer) {
      clearInterval(this.autoCycleTimer)
      this.autoCycleTimer = null
    }
  }

  // Check if auto-cycling
  isAutoCycling(): boolean {
    return this.autoCycleEnabled && this.cachedEvents.length > 1
  }

  // Toggle completion status of current event
  async toggleComplete(): Promise<void> {
    // Get active events only
    const activeEvents = this.cachedEvents.filter((e) => !e.completed)
    if (activeEvents.length === 0) return

    const currentEvent = activeEvents[this.currentEventIndex]
    if (!currentEvent || !currentEvent.id) return

    // Mark as completed
    this.completedEventIds.add(currentEvent.id)
    currentEvent.completed = true

    // Save to storage
    await AsyncStorage.setItem(COMPLETED_EVENTS_KEY, JSON.stringify(Array.from(this.completedEventIds)))

    // Move to next active event if available
    const remainingActive = this.cachedEvents.filter((e) => !e.completed)
    if (remainingActive.length > 0 && this.currentEventIndex >= remainingActive.length) {
      this.currentEventIndex = 0
    }
  }

  // Clear all completed events (e.g., at end of day)
  async clearCompleted(): Promise<void> {
    this.completedEventIds.clear()
    this.cachedEvents.forEach((e) => (e.completed = false))
    await AsyncStorage.removeItem(COMPLETED_EVENTS_KEY)
  }

  // Import events from JSON
  async importFromJSON(jsonContent: string): Promise<{success: boolean; message: string; count?: number}> {
    try {
      const parsed = JSON.parse(jsonContent)

      // Support both array and object with events array
      const eventsArray = Array.isArray(parsed) ? parsed : parsed.events || []

      if (!Array.isArray(eventsArray) || eventsArray.length === 0) {
        return {success: false, message: "No events found in JSON"}
      }

      // Validate and convert to CalendarEvent format
      const importedEvents: CalendarEvent[] = []
      for (const event of eventsArray) {
        if (!event.title) continue

        importedEvents.push({
          id: event.id || `imported-${Date.now()}-${Math.random()}`,
          title: event.title,
          start: event.start || event.startDate,
          end: event.end || event.endDate,
          completed: false,
        })
      }

      if (importedEvents.length === 0) {
        return {success: false, message: "No valid events found"}
      }

      // Replace cached events with imported ones
      this.cachedEvents = importedEvents
      this.currentEventIndex = 0

      // Clear completed events since these are new
      await this.clearCompleted()

      return {
        success: true,
        message: `Imported ${importedEvents.length} events`,
        count: importedEvents.length,
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to parse JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
      }
    }
  }

  private parseTime(timeStr: string): Date | null {
    try {
      const match = timeStr.match(/(\d{1,2}):(\d{2})\s*([AP]M)/)
      if (!match) return null

      let hours = parseInt(match[1])
      const minutes = parseInt(match[2])
      const period = match[3]

      if (period === "PM" && hours !== 12) hours += 12
      if (period === "AM" && hours === 12) hours = 0

      const now = new Date()
      const eventTime = new Date(now)
      eventTime.setHours(hours, minutes, 0, 0)

      return eventTime
    } catch {
      return null
    }
  }
}
