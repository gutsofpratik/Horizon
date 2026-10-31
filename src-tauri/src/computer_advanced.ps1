$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$a = [Console]::In.ReadToEnd() | ConvertFrom-Json
if ($a.operation -eq 'computer_clipboard_read') { $text=[string](Get-Clipboard -Raw); @{text=$text.Substring(0,[Math]::Min(100000,$text.Length));truncated=($text.Length -gt 100000)} | ConvertTo-Json -Compress; exit }
if ($a.operation -eq 'computer_clipboard_write') { Set-Clipboard -Value ([string]$a.text); @{written=$true} | ConvertTo-Json -Compress; exit }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]([long]$a.handle))
if (!$root -or $root.Current.ProcessId -ne $a.pid) { throw 'Window changed; inspect windows again' }
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$queue = [Collections.Generic.Queue[object]]::new()
$queue.Enqueue(@{element=$root;parent=$null})
$nodes = [Collections.Generic.List[object]]::new()
$timer = [Diagnostics.Stopwatch]::StartNew()
$found = $null
$limit = if ($a.operation -eq 'computer_ui_tree') { [Math]::Min(300,[Math]::Max(1,[int]$a.max_nodes)) } else { 300 }
while ($queue.Count -gt 0 -and $nodes.Count -lt $limit -and $timer.ElapsedMilliseconds -lt 8000) {
 $item=$queue.Dequeue(); $e=$item.element; $c=$e.Current
 $id=($e.GetRuntimeId() -join '.')
 if ($c.IsPassword) { continue }
 $nodes.Add(@{element_id=$id;parent=$item.parent;name=([string]$c.Name).Substring(0,[Math]::Min(1000,([string]$c.Name).Length));control_type=$c.ControlType.ProgrammaticName;enabled=$c.IsEnabled;offscreen=$c.IsOffscreen;patterns=@($e.GetSupportedPatterns() | ForEach-Object ProgrammaticName)})
 if ($a.operation -eq 'computer_ui_element_action' -and $id -eq $a.element_id) { $found=$e; break }
 $child=$walker.GetFirstChild($e)
 while ($child -and $queue.Count -lt 600 -and $timer.ElapsedMilliseconds -lt 8000) { $queue.Enqueue(@{element=$child;parent=$id}); $child=$walker.GetNextSibling($child) }
}
if ($a.operation -eq 'computer_ui_tree') { @{nodes=@($nodes.ToArray());truncated=($queue.Count -gt 0)} | ConvertTo-Json -Depth 8 -Compress; exit }
if (!$found) { throw 'Element is stale or unavailable; inspect the tree again' }
switch ($a.action) {
 'focus' { $found.SetFocus() }
 'invoke' { $found.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() }
 'set_value' { $found.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue([string]$a.value) }
 'toggle' { $found.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Toggle() }
 'select' { $found.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() }
 'expand' { $found.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Expand() }
 'collapse' { $found.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Collapse() }
 default { throw 'Unsupported accessibility action' }
}
@{performed=$a.action} | ConvertTo-Json -Compress
