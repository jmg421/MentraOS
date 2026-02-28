import {BaseWidget, WidgetData} from "./Widget"
import AsyncStorage from "@react-native-async-storage/async-storage"

interface TeleprompterData extends WidgetData {
  text?: string
  currentLine?: number
  totalLines?: number
  isAutoScrolling?: boolean
  scrollSpeed?: number // lines per second
}

const STORAGE_KEY = "@teleprompter_text"
const VERSION_KEY = "@teleprompter_version"
const SPEED_KEY = "@teleprompter_speed"

export class TeleprompterWidget extends BaseWidget {
  id = "teleprompter"
  name = "Teleprompter"
  refreshInterval = 0 // Manual only
  version = "1.2.0" // Track widget version - bump to force script update

  private currentLine = 0
  private lines: string[] = []
  private isAutoScrolling = false
  private scrollSpeed = 0.5 // lines per second (default: 1 line every 2 seconds)
  private autoScrollTimer: any = null

  async fetchData(): Promise<TeleprompterData> {
    // Temporarily suppress console.log during calendar fetch
    const originalLog = console.log
    console.log = () => {}

    try {
      // Check if version changed - if so, reset script
      const savedVersion = await AsyncStorage.getItem(VERSION_KEY)
      if (savedVersion !== this.version) {
        await AsyncStorage.removeItem(STORAGE_KEY)
        await AsyncStorage.setItem(VERSION_KEY, this.version)
      }

      // Load saved speed
      const savedSpeed = await AsyncStorage.getItem(SPEED_KEY)
      if (savedSpeed) {
        this.scrollSpeed = parseFloat(savedSpeed)
      }

      // Load saved text from storage
      let savedText = await AsyncStorage.getItem(STORAGE_KEY)

      if (!savedText) {
        // Default script for Nodes Bio meeting + Latin vocabulary
        savedText =
          "Hi Doug, great to connect with you today. I'm excited to discuss the EMR integration for Nodes Bio. I have the MentraOS dashboard running on my Even Realities G1 glasses right now. As you can see, we've built a fully offline system that displays real-time data contextually based on head position. For your EMR integration, we can pull patient data, vitals, and notes directly onto the glasses, allowing clinicians to stay hands-free while accessing critical information. The system works completely offline and untethered, which is perfect for clinical environments. I'd love to show you how we can customize this for Nodes Bio's specific workflows. What aspects of the EMR integration are most important to you? --- LATIN VOCABULARY --- Carpe diem (KAR-pay DEE-em): Seize the day. Memento mori (meh-MEN-toh MOR-ee): Remember you must die. Veni vidi vici (WEH-nee WEE-dee WEE-kee): I came, I saw, I conquered. Cogito ergo sum (KOH-gee-toh ER-goh SOOM): I think, therefore I am. Per aspera ad astra (per AS-per-ah ad AS-trah): Through hardships to the stars. Amor vincit omnia (AH-mor WIN-kit OM-nee-ah): Love conquers all. Tempus fugit (TEM-poos FOO-git): Time flies. Ars longa vita brevis (ARS LON-gah WEE-tah BREH-wis): Art is long, life is short. Audentes fortuna iuvat (ow-DEN-tays for-TOO-nah YOO-waht): Fortune favors the bold. Festina lente (fes-TEE-nah LEN-tay): Make haste slowly."
        // Save default script
        await AsyncStorage.setItem(STORAGE_KEY, savedText)
      }

      // Split into lines that fit G1 display (~39 chars)
      this.lines = this.splitIntoLines(savedText)

      if (this.currentLine >= this.lines.length) {
        this.currentLine = 0 // Loop back
      }

      console.log = originalLog
      return {
        text: savedText,
        currentLine: this.currentLine,
        totalLines: this.lines.length,
        isAutoScrolling: this.isAutoScrolling,
        scrollSpeed: this.scrollSpeed,
      }
    } catch (error) {
      console.log = originalLog
      console.error("[TeleprompterWidget] Error:", error)
      return {}
    }
  }

  formatDisplay(data: TeleprompterData): string {
    // Handle empty data or no text
    if (!data || !data.text || this.lines.length === 0) {
      return [`TELEPROMPTER v${this.version}`, "", "No script loaded.", "Add text in Dashboard Controls."].join("\n")
    }

    // Show current line + next 3 lines (5 lines total with header)
    const displayLines = [
      `TELEPROMPTER (${this.currentLine + 1}/${this.lines.length})`,
      this.lines[this.currentLine] || "",
      this.lines[this.currentLine + 1] || "",
      this.lines[this.currentLine + 2] || "",
      this.lines[this.currentLine + 3] || "",
    ]

    return displayLines.join("\n")
  }

  // Advance to next line
  async next(): Promise<void> {
    this.currentLine++
    if (this.currentLine >= this.lines.length) {
      this.currentLine = 0 // Loop
    }
  }

  // Go back one line
  async previous(): Promise<void> {
    this.currentLine--
    if (this.currentLine < 0) {
      this.currentLine = Math.max(0, this.lines.length - 1)
    }
  }

  // Reset to beginning
  async reset(): Promise<void> {
    this.currentLine = 0
  }

  // Toggle auto-scroll
  toggleAutoScroll(callback?: () => void): void {
    this.isAutoScrolling = !this.isAutoScrolling

    if (this.isAutoScrolling) {
      this.startAutoScroll(callback)
    } else {
      this.stopAutoScroll()
    }
  }

  // Start auto-scrolling
  private startAutoScroll(callback?: () => void): void {
    this.stopAutoScroll() // Clear any existing timer

    const intervalMs = (1 / this.scrollSpeed) * 1000

    this.autoScrollTimer = setInterval(async () => {
      await this.next()
      if (callback) callback()
    }, intervalMs)
  }

  // Stop auto-scrolling
  private stopAutoScroll(): void {
    if (this.autoScrollTimer) {
      clearInterval(this.autoScrollTimer)
      this.autoScrollTimer = null
    }
  }

  // Set scroll speed (lines per second)
  async setScrollSpeed(speed: number): Promise<void> {
    this.scrollSpeed = Math.max(0.1, Math.min(5, speed)) // Clamp between 0.1 and 5
    await AsyncStorage.setItem(SPEED_KEY, this.scrollSpeed.toString())

    // Restart auto-scroll if active
    if (this.isAutoScrolling && this.autoScrollTimer) {
      this.stopAutoScroll()
      this.startAutoScroll()
    }
  }

  // Get current scroll speed
  getScrollSpeed(): number {
    return this.scrollSpeed
  }

  // Check if auto-scrolling
  isScrolling(): boolean {
    return this.isAutoScrolling
  }

  // Save new script
  static async saveScript(text: string): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, text)
  }

  // Load saved script
  static async loadScript(): Promise<string | null> {
    return await AsyncStorage.getItem(STORAGE_KEY)
  }

  // Load script from file
  static async loadFromFile(): Promise<string | null> {
    try {
      const DocumentPicker = await import("expo-document-picker")

      const result = await DocumentPicker.getDocumentAsync({
        type: "text/plain",
        copyToCacheDirectory: true,
      })

      if (result.canceled) return null

      const response = await fetch(result.assets[0].uri)
      const content = await response.text()
      await this.saveScript(content)
      return content
    } catch (error) {
      console.error("[TeleprompterWidget] File load error:", error)
      return null
    }
  }

  private splitIntoLines(text: string): string[] {
    const lines: string[] = []
    const maxLineLength = 39

    // Split by newlines first to preserve document structure
    const paragraphs = text.split("\n")

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim()

      // Empty lines become blank lines (preserve spacing)
      if (trimmed === "") {
        lines.push("")
        continue
      }

      // Headers (lines with === or all caps) - keep as-is if they fit
      if (trimmed.includes("===") || (trimmed === trimmed.toUpperCase() && trimmed.length < maxLineLength)) {
        if (trimmed.length <= maxLineLength) {
          lines.push(trimmed)
        } else {
          // Split long headers
          this.wrapLine(trimmed, maxLineLength, lines)
        }
        continue
      }

      // Regular text - word wrap
      this.wrapLine(trimmed, maxLineLength, lines)
    }

    return lines
  }

  private wrapLine(text: string, maxLength: number, lines: string[]): void {
    const words = text.split(/\s+/)
    let currentLine = ""

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word

      if (testLine.length <= maxLength) {
        currentLine = testLine
      } else {
        if (currentLine) lines.push(currentLine)
        currentLine = word

        // If single word is too long, split it
        if (word.length > maxLength) {
          lines.push(word.substring(0, maxLength))
          currentLine = word.substring(maxLength)
        }
      }
    }

    if (currentLine) lines.push(currentLine)
  }
}
