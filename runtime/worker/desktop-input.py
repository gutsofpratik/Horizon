import json,sys,subprocess
import pyautogui as ui
ui.FAILSAFE=False
ui.PAUSE=0.08
request=json.load(sys.stdin);op=request['operation'];args=request['args']
def point(x,y):
    if not 0<=x<1280 or not 0<=y<800: raise ValueError('Coordinates outside screenshot')
if op=='computer_pointer':
    point(args['x'],args['y'])
    names={'CTRL':'ctrl','ALT':'alt','SHIFT':'shift','META':'win'}
    held=[]
    button={'wheel':'middle','back':'x1','forward':'x2'}.get(args.get('button','left'),args.get('button','left'))
    down=False
    try:
        for modifier in args.get('modifiers',[]):
            ui.keyDown(names[modifier]);held.append(names[modifier])
        ui.moveTo(args['x'],args['y'])
        action=args['action']
        if action in ('click','double_click'):
            if button in ('x1','x2'):
                subprocess.run(['xdotool','click','8' if button=='x1' else '9'],check=True)
                if action=='double_click':subprocess.run(['xdotool','click','8' if button=='x1' else '9'],check=True)
            else:ui.click(clicks=2 if action=='double_click' else 1,button=button)
        elif action=='drag':
            if button in ('x1','x2'):raise ValueError('Side-button dragging is unavailable on this desktop backend')
            path=args['path']
            for p in path:point(p['x'],p['y'])
            ui.moveTo(path[0]['x'],path[0]['y']);ui.mouseDown(button=button);down=True
            for p in path[1:]:ui.moveTo(p['x'],p['y'],duration=args.get('duration_ms',500)/1000/max(1,len(path)-1))
        elif action=='scroll':
            ui.hscroll(args.get('scroll_x',0));ui.scroll(args.get('scroll_y',0))
        elif action!='move':raise ValueError('Unknown pointer action')
    finally:
        if down:ui.mouseUp(button=button)
        for modifier in reversed(held):ui.keyUp(modifier)
elif op=='computer_click':
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
