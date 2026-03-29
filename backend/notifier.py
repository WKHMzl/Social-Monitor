import subprocess
import html
from typing import List


def send_windows_notification(new_count: int, subreddits: List[str]) -> bool:
    """
    Send a clickable Windows 11 toast notification using PowerShell WinRT.
    Clicking the notification opens http://localhost:3002 in the default browser.
    Fails silently if PowerShell is unavailable.

    Returns:
        True if notification was sent, False otherwise
    """
    plural = "opportunity" if new_count == 1 else "opportunities"
    subs_display = ", ".join([f"r/{s}" for s in subreddits[:3]])
    if len(subreddits) > 3:
        subs_display += f" +{len(subreddits) - 3} more"

    title = html.escape(f"SocialMonitor — {new_count} new {plural}!")
    message = html.escape(subs_display)

    # PowerShell WinRT toast with click-to-open URL (no extra Python deps)
    script = f"""
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
$xml_str = '<toast activationType="protocol" launch="http://localhost:3002"><visual><binding template="ToastGeneric"><text>{title}</text><text>{message}</text></binding></visual></toast>'
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($xml_str)
$toast = New-Object Windows.UI.Notifications.ToastNotification $xml
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('SocialMonitor').Show($toast)
"""

    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True,
            timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        if result.returncode == 0:
            return True
        print(f"[Notifier] PowerShell error: {result.stderr.decode(errors='ignore').strip()}")
        return False
    except Exception as e:
        print(f"[Notifier] Failed to send notification: {e}")
        return False
