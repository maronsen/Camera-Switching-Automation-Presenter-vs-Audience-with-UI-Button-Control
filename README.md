# Camera Switching Automation (Presenter vs Audience) with UI Button Control

## Extended Description

This macro was created to make camera behavior in presenter-focused Cisco Room systems more automatic, stable, and easy to use. It is intended for rooms with separate audience and presenter cameras, where the audience camera should normally be the default view, but the presenter camera should automatically become active when someone is detected in the presenter area.

The macro reduces the need for manual camera control during hybrid meetings. Instead of requiring users to select the correct camera input, enable PresenterTrack manually, or understand the room’s camera setup, the macro uses PresenterTrack detection, call state, and configurable RoomOS UI controls to decide when automatic camera switching should happen.

***

## Why This Macro Exists

In many hybrid meeting rooms, the most useful camera view changes depending on what is happening in the room. During normal discussion, remote participants usually benefit from seeing the audience or full room overview. When someone starts presenting, teaching, speaking from a lectern, or standing in a defined presenter area, the presenter camera becomes the more relevant view.

Without automation, users often need to manually switch camera sources, understand which camera input to use, or know how PresenterTrack behaves. This can be confusing, especially in rooms with multiple cameras or advanced AV setups. If the wrong camera is selected, remote participants may either miss the presenter or lose the context of the room.

This macro solves that by letting the room react automatically instead of relying on the user to make the correct camera choice. The audience camera is treated as the safe default because it gives a stable and natural overview of the room. PresenterTrack is used in the background as a detection source, allowing the system to know when a presenter is present without permanently forcing the presenter camera as the main video source.

The presenter camera is only selected when there is a clear reason to use it, and the system returns to the audience camera when presenter activity stops. Monitoring can also be limited to active calls, so the automation only runs when it is actually useful in a meeting scenario.

To make the behavior suitable for real rooms, the macro includes delayed fallback, rate limiting, and optional PresenterTrack recovery. These mechanisms help prevent unstable camera switching, reduce distracting behavior for remote participants, and keep presenter detection active during operation.

A RoomOS UI panel is included so users or technicians can control the behavior directly from the touch interface. The macro also detects Microsoft Teams Rooms and adjusts the UI placement automatically, without changing the camera switching logic.

Overall, the macro was created to improve the hybrid meeting experience by reducing manual camera control, keeping the audience view as the normal default, automatically focusing on the presenter when needed, and returning smoothly to the audience view when presenter activity ends.

***

## How The Macro Works

The macro listens to Cisco xAPI status changes for:

*   Active call state
*   PresenterTrack presenter detection
*   PresenterTrack operating status
*   RoomOS UI toggle actions

When automatic camera switching is active, the macro starts monitoring. If **Only monitor in call** is enabled, monitoring only starts when the codec reports an active call. If this option is disabled, monitoring can start even when the device is not in a call.

When monitoring starts, the macro first selects the audience camera as the main video source. This gives the room a stable and predictable starting point. It then enables PresenterTrack in `Follow` mode so the codec can detect whether a presenter is present.

PresenterTrack is used as a background detection mechanism. The macro does not immediately force the presenter camera as the main view. Instead, it keeps the audience camera active until PresenterTrack reports that a presenter has been detected.

When a presenter is detected, the macro switches the main video source to the configured presenter camera. When the presenter is no longer detected, the macro waits for a configurable delay before returning to the audience camera. This prevents unnecessary switching if the presenter briefly moves out of the tracking area or is temporarily not detected.

The workflow is:

*   Start with the audience camera
*   Enable PresenterTrack for background detection
*   Switch to the presenter camera when a presenter is detected
*   Wait briefly when presenter detection is lost
*   Return to the audience camera if the presenter remains undetected
*   Stop monitoring when the call ends, if call-based monitoring is enabled

***

## Configuration Options

The macro includes a configuration section that controls logging, camera connector IDs, timing behavior, default UI toggle states, PresenterTrack recovery, UI appearance, and UI placement.

***

### Debug Logging

```javascript
const DEBUG = true;
```

Controls whether detailed debug messages are written to the macro log.

*   `true` enables detailed debug logging
*   `false` keeps logs cleaner and only shows main operational messages

This is useful during testing, commissioning, and troubleshooting. In production, this can normally be set to `false` unless detailed logging is needed.

***

### Presenter Camera Connector

```javascript
const PRESENTER_CAMERA_CONNECTOR_ID = 8;
```

Defines which video input connector is used for the presenter camera.

This is the camera the macro switches to when PresenterTrack detects a presenter. The value must match the actual connector ID used on the Cisco codec.

Example:

*   Presenter camera connected to input 8
*   Macro switches to ConnectorId `8` when a presenter is detected

***

### Audience Camera Connector

```javascript
const AUDIENCE_CAMERA_CONNECTOR_ID = 7;
```

Defines which video input connector is used for the audience or room overview camera.

This is the default camera when monitoring starts and the camera the macro returns to when no presenter is detected.

Example:

*   Audience overview camera connected to input 7
*   Macro switches back to ConnectorId `7` when the presenter is lost

The presenter and audience connector IDs are the most important values to verify before using the macro.

***

### Presenter Loss Delay

```javascript
const LOSS_DELAY_MS = 1500;
```

Controls how long the macro waits before switching back to the audience camera after the presenter is no longer detected.

The value is configured in milliseconds.

Example:

*   `1500` = wait 1.5 seconds before returning to the audience camera

This delay makes the camera behavior smoother by avoiding immediate switching if the presenter briefly moves, turns away, or is temporarily lost by PresenterTrack.

***

### Minimum Switch Interval

```javascript
const MIN_SWITCH_INTERVAL_MS = 1500;
```

Controls the minimum allowed time between camera source changes.

The value is configured in milliseconds.

Example:

*   `1500` = at least 1.5 seconds must pass before another camera switch is allowed

This prevents camera flapping, where the system rapidly switches back and forth between the audience and presenter cameras.

***

### Default Automatic Camera Switching State

```javascript
const DEFAULT_AUTO_BEHAVIOR_ENABLED = true;
```

Controls the startup state of automatic camera switching.

*   `true` means automatic camera switching is enabled when the macro starts
*   `false` means automatic camera switching is disabled when the macro starts

This value also controls the initial state of the first UI toggle.

Use `true` when the room should normally behave automatically. Use `false` if users or technicians should manually enable the behavior from the UI panel.

***

### Default Only Monitor In Call State

```javascript
const DEFAULT_ONLY_MONITOR_IN_CALL = true;
```

Controls the startup state of the **Only monitor in call** behavior.

*   `true` means monitoring only runs while a call is active
*   `false` means monitoring can run even when the device is not in a call

This value also controls the initial state of the second UI toggle.

The recommended setting is usually `true`, because automatic camera switching is normally only needed during video meetings.

***

### PresenterTrack Auto Recovery

```javascript
const AUTO_RECOVER_PRESENTERTRACK = true;
```

Controls whether the macro should try to re-enable PresenterTrack if PresenterTrack status becomes `Off` while monitoring is active.

*   `true` means the macro attempts to set PresenterTrack back to `Follow`
*   `false` means the macro does not try to recover PresenterTrack automatically

This helps keep background presenter detection running during a meeting. If PresenterTrack stops, automatic switching may no longer receive reliable presenter detection updates.

***

### UI Panel ID

```javascript
const UI_PANEL_ID = 'autocam_panel';
```

Defines the unique ID for the RoomOS UI panel created by the macro.

This should normally stay unchanged unless another UI extension is using the same panel ID.

***

### UI Panel Order

```javascript
const UI_PANEL_ORDER = 1;
```

Controls the order of the panel in the RoomOS interface.

Lower numbers normally appear earlier in the UI. This can be adjusted if multiple custom panels are used on the same device.

***

### UI Panel Name

```javascript
const UI_PANEL_NAME = 'Camera Behavior Control';
```

Defines the visible name of the UI panel.

This is the name users see on the touch interface.

***

### UI Panel Icon

```javascript
const UI_PANEL_ICON = 'Camera';
```

Defines the icon used for the UI panel.

The macro uses a camera icon by default, making it clear that the panel controls camera behavior.

***

### UI Panel Color

```javascript
const UI_PANEL_COLOR = '#00AEEF';
```

Defines the color used for the UI panel icon or tile.

This can be changed to match room standards, customer branding, or other local UI conventions.

***

### UI Location For RoomOS

```javascript
const UI_LOCATION_ROOMOS = 'HomeScreen';
```

Defines where the UI panel is placed when the device is running normal RoomOS mode.

`HomeScreen` makes the panel visible as a home screen tile, giving users easy access to the camera behavior controls.

***

### UI Location For MTR

```javascript
const UI_LOCATION_MTR = 'ControlPanel';
```

Defines where the UI panel is placed when Microsoft Teams Rooms is detected.

When MTR is detected, the macro automatically moves the panel to the control panel instead of the home screen. This keeps the UI placement more suitable for the MTR experience.

***

### UI Widget IDs

```javascript
const UI_WIDGET_TEXTINFO_1 = 'autocam_textinfo_1';
const UI_WIDGET_TOGGLE_1 = 'autocam_toggle_1';
const UI_WIDGET_TEXTINFO_2 = 'autocam_textinfo_2';
const UI_WIDGET_TOGGLE_2 = 'autocam_toggle_2';
```

Defines the internal widget IDs used by the UI extension.

These IDs connect the visible UI elements to the macro logic. They should normally not be changed unless the matching XML and event handling are also updated.

***

### UI Text Labels

```javascript
const UI_TEXTINFO_1 = 'Automatic camera switching';
const UI_TEXTINFO_2 = 'Only monitor in call';
```

Defines the visible text shown next to each toggle in the UI panel.

*   `Automatic camera switching` controls whether the macro should actively switch between audience and presenter cameras
*   `Only monitor in call` controls whether monitoring should only run during active calls

These labels can be adjusted if customer-facing wording is preferred.

***

### UI Layout Size

```javascript
const UI_TEXT_SIZE = 3;
const UI_TOGGLE_SIZE = 1;
```

Controls the layout balance between the text field and the toggle button in each UI row.

Cisco UI Extension rows normally use size values that add up to `4`.

In this macro:

*   Text uses size `3`
*   Toggle uses size `1`

This places the information text on the left and the toggle button on the right.

***

## Practical Use Cases

### Training Rooms

The audience camera can show participants by default, while the presenter camera becomes active when an instructor moves into the presenter area.

This allows remote participants to follow both room interaction and the instructor without anyone manually changing cameras.

***

### Classrooms

Remote students can see the room overview during classroom interaction and automatically get a focused teacher view when the teacher is presenting.

This is useful in hybrid education environments where both teacher visibility and room context are important.

***

### Town Halls And Briefing Rooms

The room can stay on the audience or overview camera until a speaker enters the presentation area.

This creates a more professional experience without requiring a dedicated camera operator.

***

### Boardrooms And Meeting Rooms

During normal discussion, the room overview remains active. If someone walks up to present at a screen, whiteboard, or lectern, the system automatically switches to the presenter camera.

This makes the room easier to use for standard meetings and ad-hoc presentations.

***

### Rooms Without Dedicated Technical Support

The room can handle camera logic automatically, so users do not need to understand camera routing, input selection, or PresenterTrack behavior.

This is useful in shared meeting rooms where meetings need to work consistently without AV support present.

***

## User Experience Benefit

For local users, the macro removes the need to think about camera control. Users can simply start or join the meeting and use the room naturally.

For remote participants, the video view becomes more relevant. They see the room when the room is the focus, and they see the presenter when presentation activity begins.

The RoomOS UI panel gives users or technicians simple control over the behavior. Automatic switching can be turned on or off, and monitoring can be limited to active calls directly from the touch interface.

Because the macro uses delayed fallback and rate limiting, it avoids distracting source changes caused by short PresenterTrack detection drops.

***

## Operational Behavior

The macro treats the audience camera as the safe default view. When monitoring starts, the audience camera is selected first so the room begins with a stable overview.

The presenter camera is only selected when PresenterTrack confirms that a presenter is detected. If presenter detection is lost, the macro waits before switching back to the audience camera.

The macro also avoids repeated switching to the same camera source. If the desired camera is already active, it does not send unnecessary source selection commands.

If automatic switching is turned off from the UI, monitoring stops and the macro no longer reacts to PresenterTrack detection. If **Only monitor in call** is enabled and there is no active call, the macro waits until a call starts before monitoring begins.

***

## PresenterTrack Background Detection

PresenterTrack provides useful presenter detection from the Cisco codec. This macro uses that detection in the background while keeping the audience camera as the active main source.

This allows the room to monitor for presenter activity without permanently showing the presenter camera.

The benefit is that the room can stay in a natural audience or room overview mode until there is a clear reason to switch to the presenter camera.

***

## Call-Based Monitoring

Automatic camera switching is usually only needed during video meetings. When **Only monitor in call** is enabled, the macro starts monitoring when a call becomes active and stops when the call ends.

This keeps the room predictable when idle and prevents unnecessary camera switching outside meetings.

It is especially useful in rooms where users may wake the system, prepare content, or use the room locally before joining a call.

***

## Delay And Rate Limiting

Presenter detection can briefly change if the presenter moves, turns away, walks near the edge of the tracking area, or is temporarily blocked.

The loss delay gives the presenter a short grace period before the room switches back to the audience camera.

The minimum switch interval prevents rapid repeated switching between sources.

Together, these settings make the camera behavior smoother and better suited for real meeting rooms, where movement and short detection changes are normal.

***

## PresenterTrack Auto Recovery

Automatic switching depends on PresenterTrack being active. If PresenterTrack status becomes `Off`, the macro can try to set it back to `Follow`.

This helps maintain background presenter detection and reduces the chance that automatic switching silently stops working during a meeting.

Auto recovery is especially useful in rooms where the macro is expected to run without a technician monitoring it.

***

## MTR Detection And UI Placement

The macro includes simple Microsoft Teams Rooms detection. It checks whether the Microsoft Teams app version can be read from the codec.

If MTR is detected, the macro stores the Teams app version and moves the UI panel to the configured MTR location, which is `ControlPanel` by default.

If MTR is not detected, the panel is placed in the normal RoomOS location, which is `HomeScreen` by default.

This detection does not change the camera switching logic. It only controls where the UI panel is placed, so the user interface fits better depending on whether the device is running normal RoomOS or Microsoft Teams Rooms mode.

***

## Recommended Default Configuration

```javascript
const DEBUG = false;

const PRESENTER_CAMERA_CONNECTOR_ID = 8;
const AUDIENCE_CAMERA_CONNECTOR_ID = 7;

const LOSS_DELAY_MS = 1500;
const MIN_SWITCH_INTERVAL_MS = 1500;

const DEFAULT_AUTO_BEHAVIOR_ENABLED = true;
const DEFAULT_ONLY_MONITOR_IN_CALL = true;

const AUTO_RECOVER_PRESENTERTRACK = true;

const UI_PANEL_ID = 'autocam_panel';
const UI_PANEL_ORDER = 1;
const UI_PANEL_NAME = 'Camera Behavior Control';
const UI_PANEL_ICON = 'Camera';
const UI_PANEL_COLOR = '#00AEEF';

const UI_LOCATION_ROOMOS = 'HomeScreen';
const UI_LOCATION_MTR = 'ControlPanel';

const UI_TEXTINFO_1 = 'Automatic camera switching';
const UI_TEXTINFO_2 = 'Only monitor in call';

const UI_TEXT_SIZE = 3;
const UI_TOGGLE_SIZE = 1;
```

***

## Summary

This macro automates camera switching between audience and presenter views in Cisco Room systems. It keeps the audience camera active by default, uses PresenterTrack in the background to detect presenter activity, switches to the presenter camera when needed, and returns to the audience camera after the presenter is lost.

The macro was created to make hybrid meeting rooms easier to use and more reliable. Its main value is less manual camera control, smoother switching, call-aware monitoring, simple RoomOS UI toggles, configurable timing, correct camera source selection, optional PresenterTrack recovery, and automatic UI placement depending on whether Microsoft Teams Rooms is detected.
