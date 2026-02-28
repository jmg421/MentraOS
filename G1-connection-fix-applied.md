# G1 Connection Stability Fix - Applied Changes

**Date:** February 20, 2026  
**Issue:** G1 right side intermittently disconnects  
**Root Cause:** Race condition in sequential connection + delayed reconnection  
**Solution:** Simultaneous connection + immediate reconnection (matching EvenDemoApp)

---

## Changes Applied

### Fix 1: Simultaneous Connection (Lines 836-848)

**Before:**

```swift
if let side = leftPeripheral {
    Bridge.log("G1: connecting to left glass: \(side.name ?? "(unknown)")")
    centralManager!.connect(side, options: nil)
}

if let side = rightPeripheral {
    Bridge.log("G1: connecting to right glass: \(side.name ?? "(unknown)")")
    centralManager!.connect(side, options: nil)
}
```

**After:**

```swift
// Ensure we have both peripherals before attempting connection
guard let left = leftPeripheral, let right = rightPeripheral else {
    return false
}

// Connect BOTH simultaneously to avoid timing issues (like EvenDemoApp)
centralManager!.connect(left, options: [CBConnectPeripheralOptionNotifyOnDisconnectionKey: true])
centralManager!.connect(right, options: [CBConnectPeripheralOptionNotifyOnDisconnectionKey: true])

Bridge.log("G1: Connecting to both glasses: \(left.name ?? "?"), \(right.name ?? "?")")
```

**Benefits:**

- ✅ Eliminates timing gap between left and right connection
- ✅ Adds proper connection options
- ✅ Matches EvenDemoApp's proven approach

---

### Fix 2: Immediate Reconnection (Lines 2449-2457)

**Before:**

```swift
if peripheral == leftPeripheral || peripheral == rightPeripheral {
    // force reconnection to both before considering us ready again:
    leftPeripheral = nil
    rightPeripheral = nil
    setReadiness(left: false, right: false)
    startReconnectionTimer() // Start periodic reconnection attempts
}
```

**After:**

```swift
// Immediate reconnection (like EvenDemoApp) - don't clear peripheral references
if peripheral == leftPeripheral || peripheral == rightPeripheral {
    setReadiness(left: false, right: false)
    Bridge.log("G1: Immediately reconnecting \(side) peripheral")
    centralManager!.connect(peripheral, options: [CBConnectPeripheralOptionNotifyOnDisconnectionKey: true])
}
```

**Benefits:**

- ✅ Immediate reconnection (no timer delay)
- ✅ Keeps peripheral references (no need to rescan)
- ✅ Only reconnects the disconnected peripheral (not both)
- ✅ Matches EvenDemoApp's proven approach

---

## Expected Improvements

### Before Fix:

- ⚠️ Intermittent right-side disconnections
- ⚠️ Timing-dependent connection success
- ⚠️ Delayed reconnection (timer-based)
- ⚠️ Both peripherals cleared on single disconnect

### After Fix:

- ✅ Reliable dual-peripheral connection
- ✅ Timing-independent (simultaneous connection)
- ✅ Instant reconnection on disconnect
- ✅ Minimal disruption (only affected peripheral reconnects)

---

## Testing Instructions

### 1. Build and Deploy

```bash
cd /Users/johnmuirhead-gould/repos/MentraOS/mobile
bun ios
```

### 2. Test Initial Connection

1. Open MentraOS app
2. Pair with G1 glasses
3. Verify both left and right connect successfully
4. Repeat 10+ times to confirm reliability

### 3. Test Reconnection

1. While connected, move out of range briefly
2. Move back into range
3. Verify automatic reconnection
4. Check that disconnected side reconnects immediately

### 4. Monitor Logs

Look for:

```
G1: Connecting to both glasses: Even G1_30_L_..., Even G1_30_R_...
G1: Immediately reconnecting LEFT peripheral
G1: Immediately reconnecting RIGHT peripheral
```

---

## Rollback Instructions

If issues occur:

```bash
cd /Users/johnmuirhead-gould/repos/MentraOS
git checkout mobile/modules/core/ios/Source/sgcs/G1.swift
```

---

## Technical Details

### Why This Works

**Simultaneous Connection:**

- CoreBluetooth handles both connection attempts in parallel
- No timing window for race conditions
- Consistent with Apple's recommended approach

**Immediate Reconnection:**

- Leverages CoreBluetooth's built-in reconnection
- No state machine complexity
- Peripheral reference maintained for instant reconnect

### Alignment with EvenDemoApp

Both fixes directly match Even Realities' official implementation:

- Simultaneous `connect()` calls
- Immediate reconnection in `didDisconnectPeripheral`
- Same connection options

---

## File Modified

**Path:** `/Users/johnmuirhead-gould/repos/MentraOS/mobile/modules/core/ios/Source/sgcs/G1.swift`

**Lines Changed:**

- Lines 836-848: Connection logic
- Lines 2449-2457: Reconnection logic

**Total Changes:** ~20 lines modified

---

## Next Steps

1. ✅ Changes applied
2. ⏳ Build and test on device
3. ⏳ Verify connection reliability improves
4. ⏳ Monitor for 24-48 hours
5. ⏳ If stable, commit changes

---

**Status:** Ready for testing  
**Risk Level:** Low (matches proven EvenDemoApp approach)  
**Expected Impact:** Significant improvement in G1 connection reliability
