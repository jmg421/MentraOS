import {useState, useEffect} from "react"
import {View, ScrollView, NativeModules, Platform} from "react-native"
import {Screen, Header, Text, Button} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/contexts/ThemeContext"
import {Group} from "@/components/ui"
import DashboardManager from "@/services/DashboardManager"
import {TeleprompterWidget} from "@/services/widgets/TeleprompterWidget"
import * as DocumentPicker from "expo-document-picker"
import Slider from "@react-native-community/slider"
import {activateKeepAwakeAsync, deactivateKeepAwake} from "expo-keep-awake"

const {MediaButtonHandlerModule} = NativeModules

export default function DashboardApp() {
  const {goBack} = useNavigationHistory()
  const {theme} = useAppTheme()
  const [currentWidget, setCurrentWidget] = useState("")
  const [displayText, setDisplayText] = useState("")
  const [isAutoScrolling, setIsAutoScrolling] = useState(false)
  const [scrollSpeed, setScrollSpeed] = useState(0.5)
  const [isTeleprompterActive, setIsTeleprompterActive] = useState(false)

  // Keep screen awake when teleprompter is active
  useEffect(() => {
    if (isTeleprompterActive) {
      activateKeepAwakeAsync("teleprompter")
    } else {
      deactivateKeepAwake("teleprompter")
    }
  }, [isTeleprompterActive])

  useEffect(() => {
    // Enable media button handler when screen opens
    if (Platform.OS === "ios" && MediaButtonHandlerModule) {
      console.log("[DashboardApp] Enabling media button handler")
      MediaButtonHandlerModule.enable()
    }

    updateWidgetInfo()
    const interval = setInterval(updateWidgetInfo, 10000) // Reduced to 10 seconds

    return () => {
      clearInterval(interval)
      // Disable when leaving
      if (Platform.OS === "ios" && MediaButtonHandlerModule) {
        MediaButtonHandlerModule.disable()
      }
    }
  }, [])

  const updateWidgetInfo = async () => {
    const manager = DashboardManager.getInstance()
    const current = manager.getCurrentWidget()
    setCurrentWidget(current?.name || "None")
    setIsTeleprompterActive(current?.id === "teleprompter")

    // Disable contextual switching when on Teleprompter
    if (current?.id === "teleprompter") {
      manager.setContextualSwitching(false)

      // Update auto-scroll state
      const teleprompter = current as TeleprompterWidget
      setIsAutoScrolling(teleprompter.isScrolling())
      setScrollSpeed(teleprompter.getScrollSpeed())
    } else {
      manager.setContextualSwitching(true)
    }

    if (current) {
      try {
        const data = await current.fetchData()
        const formatted = current.formatDisplay(data)
        setDisplayText(formatted)
      } catch {
        setDisplayText("Error loading widget")
      }
    }
  }

  const handleSwitchWidget = async () => {
    const manager = DashboardManager.getInstance()
    // Re-enable contextual switching and switch to next widget
    manager.setContextualSwitching(true)
    await manager.nextWidget()
    await updateWidgetInfo()
  }

  const handleNext = async () => {
    const manager = DashboardManager.getInstance()
    const current = manager.getCurrentWidget()

    // Special handling for Teleprompter - only paginate, don't switch widgets
    if (current?.id === "teleprompter") {
      const teleprompter = current as TeleprompterWidget
      await teleprompter.next()
      await updateWidgetInfo()
      return // Don't switch widgets
    }

    // Special handling for Calendar - cycle through events
    if (current?.id === "calendar") {
      const calendar = current as any
      await calendar.next()
      await updateWidgetInfo()
      return // Don't switch widgets
    }

    await manager.nextWidget()
    await updateWidgetInfo()
  }

  const handlePrevious = async () => {
    const manager = DashboardManager.getInstance()
    const current = manager.getCurrentWidget()

    // Special handling for Teleprompter - only paginate, don't switch widgets
    if (current?.id === "teleprompter") {
      const teleprompter = current as TeleprompterWidget
      await teleprompter.previous()
      await updateWidgetInfo()
      return // Don't switch widgets
    }

    // Special handling for Calendar - cycle through events
    if (current?.id === "calendar") {
      const calendar = current as any
      await calendar.previous()
      await updateWidgetInfo()
      return // Don't switch widgets
    }

    await manager.previousWidget()
    await updateWidgetInfo()
  }

  const handleLoadFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "text/plain",
        copyToCacheDirectory: true,
      })

      if (result.canceled) return

      const response = await fetch(result.assets[0].uri)
      const content = await response.text()
      await TeleprompterWidget.saveScript(content)
      await updateWidgetInfo()
    } catch (error) {
      console.error("[Dashboard] Load file error:", error)
    }
  }

  const handleReset = async () => {
    const manager = DashboardManager.getInstance()
    const current = manager.getCurrentWidget()

    if (current?.id === "teleprompter") {
      const teleprompter = current as TeleprompterWidget
      await teleprompter.reset()
      await updateWidgetInfo()
    }
  }

  const handleToggleAutoScroll = () => {
    const manager = DashboardManager.getInstance()
    const current = manager.getCurrentWidget()

    if (current?.id === "teleprompter") {
      const teleprompter = current as TeleprompterWidget
      teleprompter.toggleAutoScroll(() => updateWidgetInfo())
      setIsAutoScrolling(!isAutoScrolling)
    }
  }

  const handleSpeedChange = async (value: number) => {
    const manager = DashboardManager.getInstance()
    const current = manager.getCurrentWidget()

    if (current?.id === "teleprompter") {
      const teleprompter = current as TeleprompterWidget
      await teleprompter.setScrollSpeed(value)
      setScrollSpeed(value)
    }
  }

  const handleToggleComplete = async () => {
    const manager = DashboardManager.getInstance()
    const current = manager.getCurrentWidget()

    if (current?.id === "calendar") {
      const calendar = current as any
      await calendar.toggleComplete()
      await updateWidgetInfo()
    }
  }

  const handleLoadCalendar = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      })

      if (result.canceled) return

      const response = await fetch(result.assets[0].uri)
      const content = await response.text()

      const manager = DashboardManager.getInstance()
      const current = manager.getCurrentWidget()

      if (current?.id === "calendar") {
        const calendar = current as any
        const result = await calendar.importFromJSON(content)

        if (result.success) {
          console.log(`[Dashboard] ${result.message}`)
          await updateWidgetInfo()
        } else {
          console.error(`[Dashboard] Import failed: ${result.message}`)
        }
      }
    } catch (error) {
      console.error("[Dashboard] Load calendar error:", error)
    }
  }

  return (
    <Screen preset="scroll">
      <Header title="Dashboard" leftIcon="chevron-left" onLeftPress={goBack} />

      <ScrollView style={{flex: 1, paddingHorizontal: theme.spacing.s4}}>
        <Group title="Current Widget">
          <View style={{padding: theme.spacing.s4}}>
            <Text style={{fontSize: 18, marginBottom: 8, fontWeight: "600"}}>{currentWidget}</Text>
            <View
              style={{
                backgroundColor: theme.colors.palette.neutral800,
                padding: theme.spacing.s4,
                borderRadius: 8,
                marginTop: 8,
              }}>
              <Text style={{fontFamily: "monospace", fontSize: 12, lineHeight: 18}}>{displayText || "Loading..."}</Text>
            </View>
          </View>
        </Group>

        <Group title="Navigation">
          <View style={{padding: theme.spacing.s4, gap: theme.spacing.s3}}>
            {currentWidget === "Teleprompter" ? (
              <>
                <Button
                  text={isAutoScrolling ? "⏸ Pause Auto-Scroll" : "▶️ Start Auto-Scroll"}
                  onPress={handleToggleAutoScroll}
                  preset={isAutoScrolling ? "reversed" : "default"}
                  style={{minHeight: 60}}
                  textStyle={{fontSize: 18, fontWeight: "700"}}
                />

                {isAutoScrolling && (
                  <View style={{paddingVertical: theme.spacing.s2}}>
                    <Text style={{fontSize: 14, marginBottom: 8, color: theme.colors.textDim}}>
                      Speed: {scrollSpeed.toFixed(1)} lines/sec
                    </Text>
                    <Slider
                      value={scrollSpeed}
                      onValueChange={handleSpeedChange}
                      minimumValue={0.1}
                      maximumValue={2}
                      step={0.1}
                      minimumTrackTintColor={theme.colors.palette.primary500}
                      maximumTrackTintColor={theme.colors.palette.neutral400}
                    />
                  </View>
                )}

                <Button
                  text="⬅️ Previous Line"
                  onPress={handlePrevious}
                  preset="default"
                  style={{minHeight: 60}}
                  textStyle={{fontSize: 18}}
                  disabled={isAutoScrolling}
                />
                <Button
                  text="Next Line ➡️"
                  onPress={handleNext}
                  preset="default"
                  style={{minHeight: 60}}
                  textStyle={{fontSize: 18}}
                  disabled={isAutoScrolling}
                />
                <Button
                  text="↺ Reset to Start"
                  onPress={handleReset}
                  preset="default"
                  style={{minHeight: 60}}
                  textStyle={{fontSize: 18}}
                />
                <Button
                  text="📄 Load Script File"
                  onPress={handleLoadFile}
                  preset="default"
                  style={{minHeight: 60}}
                  textStyle={{fontSize: 18}}
                />
                <Button
                  text="🔄 Exit Teleprompter"
                  onPress={handleSwitchWidget}
                  preset="reversed"
                  style={{minHeight: 60}}
                  textStyle={{fontSize: 18, fontWeight: "700"}}
                />
              </>
            ) : currentWidget === "Calendar" ? (
              <>
                <Button
                  text="✓ Check Off Event"
                  onPress={handleToggleComplete}
                  preset="reversed"
                  style={{minHeight: 60}}
                  textStyle={{fontSize: 18, fontWeight: "700"}}
                />
                <Button
                  text="⬅️ Previous Event"
                  onPress={handlePrevious}
                  preset="default"
                  style={{minHeight: 60}}
                  textStyle={{fontSize: 18}}
                />
                <Button
                  text="Next Event ➡️"
                  onPress={handleNext}
                  preset="default"
                  style={{minHeight: 60}}
                  textStyle={{fontSize: 18}}
                />
                <Button
                  text="📅 Import Events (JSON)"
                  onPress={handleLoadCalendar}
                  preset="default"
                  style={{minHeight: 60}}
                  textStyle={{fontSize: 18}}
                />
                <Button
                  text="🔄 Switch Widget"
                  onPress={handleSwitchWidget}
                  preset="reversed"
                  style={{minHeight: 60}}
                  textStyle={{fontSize: 18, fontWeight: "700"}}
                />
              </>
            ) : (
              <>
                <Button
                  text="⬅️ Previous Widget"
                  onPress={handlePrevious}
                  preset="default"
                  style={{minHeight: 60}}
                  textStyle={{fontSize: 18}}
                />
                <Button
                  text="Next Widget ➡️"
                  onPress={handleNext}
                  preset="default"
                  style={{minHeight: 60}}
                  textStyle={{fontSize: 18}}
                />
              </>
            )}
          </View>
        </Group>

        <Group title="Widgets">
          <View style={{padding: theme.spacing.s4}}>
            <Text style={{marginBottom: 8}}>📅 Calendar - Today&apos;s events</Text>
            <Text style={{marginBottom: 8}}>🌤️ Weather - Columbus, OH</Text>
            <Text style={{marginBottom: 8}}>🎤 Teleprompter - Scripts</Text>
          </View>
        </Group>

        <Group title="Contextual Switching">
          <View style={{padding: theme.spacing.s4}}>
            <Text style={{color: theme.colors.textDim}}>
              Dashboard automatically switches based on head position:
              {"\n\n"}• Heads Up → Weather (quick glance)
              {"\n"}• Heads Down → Calendar (detailed info)
              {"\n\n"}
              Note: Contextual switching is disabled in Teleprompter mode.
            </Text>
          </View>
        </Group>
      </ScrollView>
    </Screen>
  )
}
