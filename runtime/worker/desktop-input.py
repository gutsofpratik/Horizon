import json,sys,subprocess
import pyautogui as ui
ui.FAILSAFE=False
ui.PAUSE=0.08
request=json.load(sys.stdin);op=request['operation'];args=request['args']
def point(x,y):
    if not 0<=x<1280 or not 0<=y<800: raise ValueError('Coordinates outside screenshot')
if op=='computer_click':
    point(args['x'],args['y']);ui.click(args['x'],args['y'],clicks=args.get('click_count',1),button=args.get('button','left'))
elif op=='computer_move':
    point(args['x'],args['y']);ui.moveTo(args['x'],args['y'])
elif op=='computer_drag':
    point(args['start_x'],args['start_y']);point(args['end_x'],args['end_y']);ui.moveTo(args['start_x'],args['start_y']);ui.dragTo(args['end_x'],args['end_y'],duration=args.get('duration',0.5))
elif op=='computer_scroll': ui.scroll(args['amount'])
elif op=='computer_type':
    subprocess.run(['xclip','-selection','clipboard'],input=args['text'].encode(),check=True);ui.hotkey('ctrl','v')
elif op=='computer_key':
    keys=args['keys']
    if any(key not in ui.KEYBOARD_KEYS for key in keys): raise ValueError('Unsupported key')
    ui.hotkey(*keys)
else: raise ValueError('Unknown desktop operation')
print(json.dumps({'performed':op}))
