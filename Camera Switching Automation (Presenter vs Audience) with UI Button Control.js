
import xapi from 'xapi';
/* =========================================================
   AUTO CAMERA SWITCHING
   PresenterTrack monitored in background
   =========================================================
   Goal:
   - Keep Audience camera as main video unless a presenter is detected.
   - Monitor PresenterTrack in the background without switching main video.
   - When presenter is detected -> switch main video to Presenter camera.
   - When presenter is lost -> switch main video to Audience camera.
   - Only monitor while in a call when "Only monitor in call" is enabled.
   - UI toggles allow enabling/disabling:
     1. Automatic camera switching
     2. Only monitor in call
   Core functionality preserved:
   - PresenterDetected drives camera switching.
   - PresenterTrack Follow is enabled for background detection.
   - Audience camera is default when monitoring starts.
   - Loss delay is used before returning to Audience camera.
   - Rate limiting is used to prevent flapping.
   - PresenterTrack recovery can re-enable Follow if status becomes Off.
   ========================================================= */

/* =========================
   CONFIG — START
   ========================= */
const DEBUG = true;
// Camera connector IDs. MUST match your codec inputs.
const PRESENTER_CAMERA_CONNECTOR_ID = 8;
const AUDIENCE_CAMERA_CONNECTOR_ID = 7;
// Delay before switching back to Audience after presenter is lost, in milliseconds.
const LOSS_DELAY_MS = 1500;
// Rate limit switching to prevent flapping, in milliseconds.
const MIN_SWITCH_INTERVAL_MS = 1500;
// Default state for automatic camera switching.
// This controls togglebutton1 at startup.
const DEFAULT_AUTO_BEHAVIOR_ENABLED = true;
// Default setting for "Only monitor in call".
// This controls togglebutton2 at startup.
const DEFAULT_ONLY_MONITOR_IN_CALL = true;
// Controls if PresenterTrack Status becomes Off during monitoring, try to re-enable or don't.
const AUTO_RECOVER_PRESENTERTRACK = true;
// UI panel settings.
const UI_PANEL_ID = 'autocam_panel';
const UI_PANEL_ORDER = 1;
const UI_PANEL_NAME = 'Camera Behavior Control';
const UI_PANEL_ICON = 'Camera';
const UI_PANEL_COLOR = '#00AEEF';
// UI location.
// Normal RoomOS uses HomeScreen.
// If MTR is detected, the panel is automatically moved to ControlPanel.
const UI_LOCATION_ROOMOS = 'HomeScreen';
const UI_LOCATION_MTR = 'ControlPanel';
// UI widget IDs.
const UI_WIDGET_TEXTINFO_1 = 'autocam_textinfo_1';
const UI_WIDGET_TOGGLE_1 = 'autocam_toggle_1';
const UI_WIDGET_TEXTINFO_2 = 'autocam_textinfo_2';
const UI_WIDGET_TOGGLE_2 = 'autocam_toggle_2';
// UI text labels.
const UI_TEXTINFO_1 = 'Automatic camera switching';
const UI_TEXTINFO_2 = 'Only monitor in call';
// UI layout.
// Cisco UI Extension rows normally use size values that add up to 4.
const UI_TEXT_SIZE = 3;
const UI_TOGGLE_SIZE = 1;
/* =========================
   CONFIG — END
   ========================= */

/* =========================
   RUNTIME STATE
   ========================= */
let autoBehaviorEnabled = DEFAULT_AUTO_BEHAVIOR_ENABLED;
let onlyMonitorInCall = DEFAULT_ONLY_MONITOR_IN_CALL;
// MTR runtime flags.
let mtrInstalled = false;
let mtrTeamsAppVersion = null;
let mtrTeamsAppVersionCode = null;
let mtrDetectionMethod = 'none';
// Call and monitoring state.
let inCall = false;
let active = false;
// Camera switching state.
let lastSwitchTime = 0;
let lastDesiredSource = null; // 'presenter' | 'audience' | null
let lossTimer = null;

/* =========================
   LOGGING HELPERS
   ========================= */
function log(msg) {
  console.log(`AutoCam: ${msg}`);
}
function dbg(msg) {
  if (!DEBUG) return;
  console.log(`AutoCam DEBUG: ${msg}`);
}
function errorText(e) {
  if (!e) return 'Unknown error';
  if (e.message) return e.message;
  try {
    return JSON.stringify(e);
  } catch (jsonError) {
    return String(e);
  }
}

/* =========================
   MTR DETECTION
   ========================= */
async function updateMtrFlags() {
  /*
    Simple MTR detection.
    What this does:
    - Tries to read the Microsoft Teams App version.
    - If the version can be read, MTR is considered installed/present.
    - Stores the result in runtime flags.
    - Does not change camera switching logic.
    - Only affects UI location:
      - MTR detected     -> ControlPanel
      - MTR not detected -> HomeScreen
  */
  mtrInstalled = false;
  mtrTeamsAppVersion = null;
  mtrTeamsAppVersionCode = null;
  mtrDetectionMethod = 'none';
  try {
    mtrTeamsAppVersion = await xapi.Status.MicrosoftTeams.Software.Version.TeamsApp.get();
    if (mtrTeamsAppVersion) {
      mtrInstalled = true;
      mtrDetectionMethod = 'MicrosoftTeams.Software.Version.TeamsApp';
    }
  } catch (e) {
    dbg(`MTR TeamsApp version not readable: ${errorText(e)}`);
  }
  try {
    mtrTeamsAppVersionCode = await xapi.Status.MicrosoftTeams.Software.VersionCode.TeamsApp.get();
  } catch (e) {
    dbg(`MTR TeamsApp version code not readable: ${errorText(e)}`);
  }
  if (mtrInstalled) {
    log(
      `MTR detected. ` +
      `TeamsAppVersion=${mtrTeamsAppVersion || 'unknown'} ` +
      `VersionCode=${mtrTeamsAppVersionCode || 'unknown'} ` +
      `Method=${mtrDetectionMethod}`
    );
  } else {
    log('MTR not detected.');
  }
}

/* =========================
   UI EXTENSION
   ========================= */
async function buildOrUpdatePanel() {
  const uiLocation = mtrInstalled ? UI_LOCATION_MTR : UI_LOCATION_ROOMOS;
  const panelXml =
`<Extensions>
  <Panel>
    <Order>${UI_PANEL_ORDER}</Order>
    <PanelId>${UI_PANEL_ID}</PanelId>
    <Location>${uiLocation}</Location>
    <Icon>${UI_PANEL_ICON}</Icon>
    <Color>${UI_PANEL_COLOR}</Color>
    <Name>${UI_PANEL_NAME}</Name>
    <ActivityType>Custom</ActivityType>
    <Page>
      <Name>${UI_PANEL_NAME}</Name>
      <Row>
        <Name></Name>
        <Widget>
          <WidgetId>${UI_WIDGET_TEXTINFO_1}</WidgetId>
          <Name>${UI_TEXTINFO_1}</Name>
          <Type>Text</Type>
          <Options>size=${UI_TEXT_SIZE};align=left</Options>
        </Widget>
        <Widget>
          <WidgetId>${UI_WIDGET_TOGGLE_1}</WidgetId>
          <Name></Name>
          <Type>ToggleButton</Type>
          <Options>size=${UI_TOGGLE_SIZE};align=right</Options>
          <Value>${autoBehaviorEnabled ? 'on' : 'off'}</Value>
        </Widget>
      </Row>
      <Row>
        <Name></Name>
        <Widget>
          <WidgetId>${UI_WIDGET_TEXTINFO_2}</WidgetId>
          <Name>${UI_TEXTINFO_2}</Name>
          <Type>Text</Type>
          <Options>size=${UI_TEXT_SIZE};align=left</Options>
        </Widget>
        <Widget>
          <WidgetId>${UI_WIDGET_TOGGLE_2}</WidgetId>
          <Name></Name>
          <Type>ToggleButton</Type>
          <Options>size=${UI_TOGGLE_SIZE};align=right</Options>
          <Value>${onlyMonitorInCall ? 'on' : 'off'}</Value>
        </Widget>
      </Row>
    </Page>
  </Panel>
</Extensions>`;
  try {
    await xapi.Command.UserInterface.Extensions.Panel.Save(
      { PanelId: UI_PANEL_ID },
      panelXml
    );
    log(`UI panel saved. Location=${uiLocation}`);
  } catch (e) {
    log(`ERROR saving UI panel: ${errorText(e)}`);
  }
  await updateUiState();
}
async function updateUiState() {
  try {
    await xapi.Command.UserInterface.Extensions.Widget.SetValue({
      WidgetId: UI_WIDGET_TOGGLE_1,
      Value: autoBehaviorEnabled ? 'on' : 'off'
    });
    dbg(`togglebutton1 updated to ${autoBehaviorEnabled ? 'on' : 'off'}`);
  } catch (e) {
    log(`WARN: Unable to update togglebutton1 state: ${errorText(e)}`);
  }
  try {
    await xapi.Command.UserInterface.Extensions.Widget.SetValue({
      WidgetId: UI_WIDGET_TOGGLE_2,
      Value: onlyMonitorInCall ? 'on' : 'off'
    });
    dbg(`togglebutton2 updated to ${onlyMonitorInCall ? 'on' : 'off'}`);
  } catch (e) {
    log(`WARN: Unable to update togglebutton2 state: ${errorText(e)}`);
  }
}
function getToggleValueFromEvent(event, currentValue) {
  /*
    ToggleButton normally sends:
    - Type: changed
    - Value: on/off
    If no usable value is received, keep current state.
  */
  if (event.Value === 'on') return true;
  if (event.Value === 'off') return false;
  dbg(`Toggle event did not contain usable Value. Keeping current value=${currentValue ? 'ON' : 'OFF'}`);
  return currentValue;
}
async function handleToggleAction(event) {
  try {
    if (!event || !event.WidgetId) return;
    if (event.Type !== 'changed') {
      dbg(`Ignoring widget event type: ${event.Type}`);
      return;
    }
    if (event.WidgetId === UI_WIDGET_TOGGLE_1) {
      const enabled = getToggleValueFromEvent(event, autoBehaviorEnabled);
      log(`togglebutton1 state change detected. Automatic camera switching requested=${enabled ? 'ON' : 'OFF'}`);
      await setAutoBehaviorEnabled(enabled);
      return;
    }
    if (event.WidgetId === UI_WIDGET_TOGGLE_2) {
      const enabled = getToggleValueFromEvent(event, onlyMonitorInCall);
      log(`togglebutton2 state change detected. Only monitor in call requested=${enabled ? 'ON' : 'OFF'}`);
      await setOnlyMonitorInCall(enabled);
      return;
    }
    dbg(`Ignoring widget action from unknown WidgetId=${event.WidgetId}`);
  } catch (e) {
    log(`ERROR handling toggle action: ${errorText(e)}`);
  }
}
function subscribeUiActions() {
  try {
    xapi.Event.UserInterface.Extensions.Widget.Action.on(handleToggleAction);
    log('Subscribed to UI toggle actions.');
  } catch (e) {
    log(`ERROR subscribing to UI widget actions: ${errorText(e)}`);
  }
}
/* =========================
   MODE CONTROL
   ========================= */
async function setAutoBehaviorEnabled(enabled) {
  const newValue = !!enabled;
  if (newValue === autoBehaviorEnabled) {
    dbg(`Automatic camera switching already ${autoBehaviorEnabled ? 'ON' : 'OFF'}`);
    await updateUiState();
    return;
  }
  autoBehaviorEnabled = newValue;
  log(`Automatic camera switching set to ${autoBehaviorEnabled ? 'ON' : 'OFF'}`);
  await updateUiState();
  if (autoBehaviorEnabled) {
    await activateAutomaticSwitchingMode();
  } else {
    deactivateAutomaticSwitchingMode();
  }
}
async function setOnlyMonitorInCall(enabled) {
  const newValue = !!enabled;
  if (newValue === onlyMonitorInCall) {
    dbg(`Only monitor in call already ${onlyMonitorInCall ? 'ON' : 'OFF'}`);
    await updateUiState();
    return;
  }
  onlyMonitorInCall = newValue;
  log(`Only monitor in call set to ${onlyMonitorInCall ? 'ON' : 'OFF'}`);
  await updateUiState();
  if (!autoBehaviorEnabled) {
    dbg('Only monitor in call changed, but automatic camera switching is OFF.');
    return;
  }
  if (onlyMonitorInCall && !inCall) {
    log('Only monitor in call enabled and no active call exists. Stopping monitoring.');
    stopMonitoring();
    return;
  }
  await activateAutomaticSwitchingMode();
}
async function activateAutomaticSwitchingMode() {
  try {
    if (!autoBehaviorEnabled) {
      dbg('Automatic camera switching is OFF. Monitoring will not start.');
      return;
    }
    if (onlyMonitorInCall && !inCall) {
      log('Automatic camera switching enabled. Waiting for active call before monitoring starts.');
      return;
    }
    await startMonitoring();
  } catch (e) {
    log(`ERROR activating automatic camera switching: ${errorText(e)}`);
  }
}
function deactivateAutomaticSwitchingMode() {
  try {
    stopMonitoring();
    log('Automatic camera switching deactivated.');
  } catch (e) {
    log(`ERROR deactivating automatic camera switching: ${errorText(e)}`);
  }
}

/* =========================
   CORE CAMERA SWITCHING LOGIC
   ========================= */
function isEnabled() {
  if (!autoBehaviorEnabled) return false;
  if (!active) return false;
  if (!onlyMonitorInCall) return true;
  return inCall;
}
function clearLossTimer() {
  try {
    if (lossTimer) {
      clearTimeout(lossTimer);
      lossTimer = null;
    }
  } catch (e) {
    log(`WARN: Failed to clear loss timer: ${errorText(e)}`);
  }
}
async function setMainSource(connectorId, label) {
  const t = Date.now();
  if (label && lastDesiredSource === label) {
    dbg(`Main source already desired: ${label}`);
    return;
  }
  if (t - lastSwitchTime < MIN_SWITCH_INTERVAL_MS) {
    dbg(`Switch rate-limited. Wanted ConnectorId=${connectorId}`);
    return;
  }
  lastSwitchTime = t;
  try {
    await xapi.Command.Video.Input.SetMainVideoSource({
      ConnectorId: connectorId
    });
    lastDesiredSource = label || null;
    log(`Main video -> ${label} (ConnectorId=${connectorId})`);
  } catch (e) {
    log(`ERROR switching main source to ${label} ConnectorId=${connectorId}: ${errorText(e)}`);
  }
}
async function setPresenterTrackFollow() {
  try {
    // Enables PresenterTrack algorithm.
    // When presenter camera is not main, it can run in Background on supported setups.
    await xapi.Command.Cameras.PresenterTrack.Set({
      Mode: 'Follow'
    });
    dbg('PresenterTrack Set: Follow');
  } catch (e) {
    log(`WARN: PresenterTrack Set Follow failed: ${errorText(e)}`);
  }
}
async function handlePresenterDetected(value) {
  try {
    if (!isEnabled()) return;
    const detected = value === true || value === 'True' || value === 'true';
    const notDetected = value === false || value === 'False' || value === 'false';
    dbg(`PresenterDetected=${value}`);
    if (detected) {
      clearLossTimer();
      // Presenter detected -> switch to presenter camera.
      await setMainSource(PRESENTER_CAMERA_CONNECTOR_ID, 'presenter');
      return;
    }
    if (notDetected) {
      clearLossTimer();
      // Presenter lost -> wait a bit to avoid flapping, then switch to audience.
      lossTimer = setTimeout(async () => {
        try {
          if (!isEnabled()) return;
          await setMainSource(AUDIENCE_CAMERA_CONNECTOR_ID, 'audience');
        } catch (e) {
          log(`ERROR in delayed audience switch: ${errorText(e)}`);
        }
      }, LOSS_DELAY_MS);
      return;
    }
    dbg(`PresenterDetected value ignored: ${value}`);
  } catch (e) {
    log(`ERROR handling PresenterDetected value ${value}: ${errorText(e)}`);
  }
}
async function handlePresenterTrackStatus(value) {
  try {
    if (!isEnabled()) return;
    if (!AUTO_RECOVER_PRESENTERTRACK) return;
    const status = String(value || '');
    dbg(`PresenterTrack Status=${status}`);
    // If tracking stops, try to re-enable Follow so background detection can continue.
    if (status === 'Off') {
      log('PresenterTrack Status=Off -> attempting recovery with Follow');
      await setPresenterTrackFollow();
    }
  } catch (e) {
    log(`ERROR handling PresenterTrack Status ${value}: ${errorText(e)}`);
  }
}
/* =========================
   MONITORING STATE
   ========================= */
async function startMonitoring() {
  try {
    if (active) return;
    if (!autoBehaviorEnabled) {
      dbg('Monitoring not started because automatic camera switching is OFF.');
      return;
    }
    if (onlyMonitorInCall && !inCall) {
      dbg('Monitoring not started because no active call exists.');
      return;
    }
    active = true;
    log('Monitoring STARTED');
    // Keep audience as main by default.
    await setMainSource(AUDIENCE_CAMERA_CONNECTOR_ID, 'audience');
    // Start PresenterTrack algorithm so it can detect in the background.
    await setPresenterTrackFollow();
    // Initial sync.
    try {
      const detected = await xapi.Status.Cameras.PresenterTrack.PresenterDetected.get();
      await handlePresenterDetected(detected);
    } catch (e) {
      dbg(`Initial PresenterDetected read failed: ${errorText(e)}`);
    }
  } catch (e) {
    active = false;
    log(`ERROR starting monitoring: ${errorText(e)}`);
  }
}
function stopMonitoring() {
  try {
    if (!active) return;
    active = false;
    clearLossTimer();
    log('Monitoring STOPPED');
  } catch (e) {
    log(`ERROR stopping monitoring: ${errorText(e)}`);
  }
}
async function handleCallCountChange(countValue) {
  try {
    const activeCalls = Number(countValue) || 0;
    const newInCall = activeCalls > 0;
    if (newInCall === inCall) return;
    inCall = newInCall;
    log(`Call state changed. inCall=${inCall} (activeCalls=${activeCalls})`);
    if (onlyMonitorInCall) {
      if (inCall && autoBehaviorEnabled) {
        await startMonitoring();
      } else {
        stopMonitoring();
      }
    } else {
      if (autoBehaviorEnabled) {
        await startMonitoring();
      }
    }
  } catch (e) {
    log(`ERROR handling call count change: ${errorText(e)}`);
  }
}
/* =========================
   INIT
   ========================= */
async function init() {
  log('Init');
  // Detect MTR installed/version as runtime flags.
  // This must run before buildOrUpdatePanel(),
  // because the UI location depends on mtrInstalled.
  await updateMtrFlags();
  try {
    await buildOrUpdatePanel();
  } catch (e) {
    log(`ERROR during UI panel build/update: ${errorText(e)}`);
  }
  subscribeUiActions();
  // Presenter detection signal.
  try {
    xapi.Status.Cameras.PresenterTrack.PresenterDetected.on(handlePresenterDetected);
    log('Subscribed to PresenterDetected.');
  } catch (e) {
    log(`ERROR subscribing to PresenterDetected: ${errorText(e)}`);
  }
  // PresenterTrack status.
  try {
    xapi.Status.Cameras.PresenterTrack.Status.on(handlePresenterTrackStatus);
    log('Subscribed to PresenterTrack Status.');
  } catch (e) {
    log(`ERROR subscribing to PresenterTrack Status: ${errorText(e)}`);
  }
  // Call gating.
  try {
    xapi.Status.SystemUnit.State.NumberOfActiveCalls.on(handleCallCountChange);
    log('Subscribed to NumberOfActiveCalls.');
  } catch (e) {
    log(`ERROR subscribing to NumberOfActiveCalls: ${errorText(e)}`);
  }
  // Startup sync.
  try {
    const callCount = await xapi.Status.SystemUnit.State.NumberOfActiveCalls.get();
    await handleCallCountChange(callCount);
  } catch (e) {
    log(`ERROR reading NumberOfActiveCalls at startup: ${errorText(e)}`);
  }
  // If call-gating is disabled, start immediately.
  if (!onlyMonitorInCall && autoBehaviorEnabled) {
    await startMonitoring();
  }
  // Ensure UI toggle states are correct after init.
  await updateUiState();
  log(
    `Startup complete. ` +
    `Automatic camera switching=${autoBehaviorEnabled ? 'ON' : 'OFF'} ` +
    `Only monitor in call=${onlyMonitorInCall ? 'ON' : 'OFF'} ` +
    `Monitoring=${active ? 'ACTIVE' : 'INACTIVE'} ` +
    `MTR installed=${mtrInstalled ? 'YES' : 'NO'} ` +
    `MTR TeamsAppVersion=${mtrTeamsAppVersion || 'unknown'}`
  );
}
init();
