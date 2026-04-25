import asyncio
import logging
import platform
from typing import Optional

from src.agent.views import ActionModel, ActionResult
from src.controller.registry.service import Registry
from src.controller.views import (
    InputTextAction,
    OpenAppAction,
    PressAction,
    PressCombinedAction,
    DragAction,
    RightClickPixel,
    LeftClickPixel,
    ScrollDownAction,
    ScrollUpAction,
    MoveToAction,
    RecordAction,
)
from src.utils import time_execution_async, time_execution_sync

logger = logging.getLogger(__name__)


def _get_platform_actions():
    """Get the appropriate platform-specific actions handler"""
    current_platform = platform.system()

    if current_platform == "Windows":
        from src.windows.actions import WindowsActions
        return WindowsActions()

    elif current_platform == "Darwin":
        from src.mac.actions import (
            left_click_pixel,
            right_click_pixel,
            move_to,
            drag_pixel,
            press,
            type_into,
            press_combination,
            scroll_up,
            scroll_down,
        )
        return type('MacOSActions', (), {
            'left_click_pixel': left_click_pixel,
            'right_click_pixel': right_click_pixel,
            'move_to': move_to,
            'drag_pixel': drag_pixel,
            'press': press,
            'type_into': type_into,
            'press_combination': press_combination,
            'scroll_up': scroll_up,
            'scroll_down': scroll_down,
        })()

    else:
        raise RuntimeError(f"Unsupported platform: {current_platform}")


def _get_platform_openapp():
    """Get the appropriate platform-specific openapp handler"""
    current_platform = platform.system()

    if current_platform == "Windows":
        from src.windows.openapp import open_application_by_name
        return open_application_by_name

    elif current_platform == "Darwin":
        from src.mac.openapp import open_application_by_name
        return open_application_by_name

    else:
        raise RuntimeError(f"Unsupported platform: {current_platform}")


class NoParamsAction(ActionModel):
    pass


class Controller:
    def __init__(self, exclude_actions: list[str] = []):
        self.exclude_actions = exclude_actions
        self.registry = Registry(exclude_actions)
        self.platform_actions = _get_platform_actions()
        self._register_default_actions()

    def _register_default_actions(self):
        @self.registry.action('Complete task', param_model=NoParamsAction)
        async def done():
            return ActionResult(extracted_content='done', is_done=True)

        @self.registry.action('Type', param_model=InputTextAction)
        async def input_text(text: str):
            try:
                platform_actions = _get_platform_actions()
                if platform.system() == "Darwin":
                    input_successful = await platform_actions.type_into(text)
                else:
                    input_successful = await platform_actions.type_text(text)
                if input_successful:
                    return ActionResult(extracted_content='Successfully input text')
                else:
                    msg = '❌ Input failed'
                    return ActionResult(extracted_content=msg, error=msg)
            except Exception as e:
                msg = f'❌ An error occurred: {str(e)}'
                logging.error(msg)
                return ActionResult(extracted_content=msg, error=msg)

        @self.registry.action("Open app", param_model=OpenAppAction)
        async def open_app(app_name: str):
            try:
                user_input = app_name
                if platform.system() == "Windows" and user_input.lower() == 'wechat':
                    user_input = '微信'
                openapp_fn = _get_platform_openapp()
                success, info = await openapp_fn(user_input)
                logger.info(f"\nLaunching app: {user_input}...")
                if success:
                    return ActionResult(extracted_content=f'✅ Launched {user_input}')
                else:
                    msg = f"❌ Failed to launch '{user_input}': {info}"
                    logger.error(msg)
                    return ActionResult(extracted_content=msg, error=msg)
            except Exception as e:
                msg = f'❌ An error occurred: {str(e)}'
                logging.error(msg)
                return ActionResult(extracted_content=msg, error=msg)

        @self.registry.action('Single Hotkey', param_model=PressAction)
        async def Hotkey(key: str = "enter"):
            platform_actions = _get_platform_actions()
            key_press = key.replace("Key.", "")
            if platform.system() == "Darwin":
                press_successful = await platform_actions.press(key_press)
            else:
                press_successful = await platform_actions.press_key(key_press)
            if press_successful:
                logging.info(f'✅ pressed key code: {key}')
                return ActionResult(extracted_content=f'Successfully press keyboard with key code {key}')
            else:
                msg = f'❌ Key press failed'
                return ActionResult(extracted_content=msg, error=msg)

        @self.registry.action('Press Multiple Hotkey', param_model=PressCombinedAction)
        async def multi_Hotkey(key1: str, key2: str, key3: Optional[str] = None):
            def clean_key(raw: str | None) -> str | None:
                if raw is None:
                    return None
                return raw.replace("Key.", "").strip("'\"")

            key1 = clean_key(key1)
            key2 = clean_key(key2)
            if key3:
                key3 = clean_key(key3)

            platform_actions = _get_platform_actions()

            if platform.system() == "Darwin":
                key_map = {
                    'cmd': 'command',
                    'delete': 'backspace'
                }
            else:
                key_map = {
                    'cmd': 'ctrl',
                    'delete': 'backspace'
                }

            def map_key(k: str) -> str:
                return key_map.get(k.lower(), k)

            key1 = map_key(key1)
            key2 = map_key(key2)
            key3 = map_key(key3) if key3 is not None else None

            if platform.system() == "Darwin":
                if key3 is not None:
                    press_successful = await platform_actions.press_combination(key1, key2, key3)
                    if press_successful:
                        logging.info(f'✅ pressed combination key: {key1}, {key2} and {key3}')
                    return ActionResult(extracted_content=f'Successfully press keyboard with key code {key1}, {key2} and {key3}')
                else:
                    press_successful = await platform_actions.press_combination(key1, key2)
                    if press_successful:
                        logging.info(f'✅ pressed combination key: {key1} and {key2}')
                    return ActionResult(extracted_content=f'Successfully press keyboard with key code {key1} and {key2}')
            else:
                if key3 is not None:
                    press_successful = await platform_actions.press_hotkey(key1, key2, key3)
                    if press_successful:
                        logging.info(f'✅ pressed combination key: {key1}, {key2} and {key3}')
                    return ActionResult(extracted_content=f'Successfully press keyboard with key code {key1}, {key2} and {key3}')
                else:
                    press_successful = await platform_actions.press_hotkey(key1, key2)
                    if press_successful:
                        logging.info(f'✅ pressed combination key: {key1} and {key2}')
                    return ActionResult(extracted_content=f'Successfully press keyboard with key code {key1} and {key2}')

        @self.registry.action('RightSingle click at specific pixel', param_model=RightClickPixel)
        async def RightSingle(position: list = [0, 0]):
            logger.debug(f'Right clicking pixel position {position}')
            try:
                platform_actions = _get_platform_actions()
                if platform.system() == "Darwin":
                    click_successful = await platform_actions.right_click_pixel(position)
                else:
                    click_successful = await platform_actions.click(position[0], position[1], button='right')
                if click_successful:
                    logging.info(f'✅ Finished right click at pixel: {position}')
                    return ActionResult(extracted_content=f'Successfully clicked pixel {position}')
                else:
                    msg = f'❌ Right click failed for pixel with position: {position}'
                    return ActionResult(extracted_content=msg, error=msg)
            except Exception as e:
                msg = f'❌ An error occurred: {str(e)}'
                logging.error(msg)
                return ActionResult(extracted_content=msg, error=msg)

        @self.registry.action('Left click at specific pixel', param_model=LeftClickPixel)
        async def Click(position: list = [0, 0]):
            logger.debug(f'Left clicking pixel position {position}')
            try:
                platform_actions = _get_platform_actions()
                if platform.system() == "Darwin":
                    click_successful = await platform_actions.left_click_pixel(position)
                else:
                    click_successful = await platform_actions.click(position[0], position[1], button='left')
                if click_successful:
                    logging.info(f'✅ Finished left click at pixel: {position}')
                    return ActionResult(extracted_content=f'Successfully clicked pixel {position}')
                else:
                    msg = f'❌ Left click failed for pixel with position: {position}'
                    return ActionResult(extracted_content=msg, error=msg)
            except Exception as e:
                msg = f'❌ An error occurred: {str(e)}'
                logging.error(msg)
                return ActionResult(extracted_content=msg, error=msg)

        @self.registry.action('Drag an object from one pixel to another', param_model=DragAction)
        async def Drag(position1: list = [0, 0], position2: list = [0, 0]):
            try:
                platform_actions = _get_platform_actions()
                if platform.system() == "Darwin":
                    drag_successful = await platform_actions.drag_pixel(position1, position2)
                else:
                    drag_successful = await platform_actions.drag(position1[0], position1[1], position2[0], position2[1])
                if drag_successful:
                    logger.info(f'Correct dragging pixel from position {position1} to {position2}')
                    return ActionResult(extracted_content=f'Successfully drag pixel {position1} to {position2}')
                else:
                    msg = f'❌ Drag failed for pixel with position: {position1}'
                    return ActionResult(extracted_content=msg, error=msg)
            except Exception as e:
                msg = f'❌ An error occurred: {str(e)}'
                logging.error(msg)
                return ActionResult(extracted_content=msg, error=msg)

        @self.registry.action('Move mouse to specific pixel', param_model=MoveToAction)
        async def move_mouse(position: list = [0, 0]):
            logger.debug(f'Move mouse to position {position}')
            try:
                platform_actions = _get_platform_actions()
                if platform.system() == "Darwin":
                    move_successful = await platform_actions.move_to(position)
                else:
                    move_successful = await platform_actions.move_mouse(position[0], position[1])
                if move_successful:
                    logging.info(f'✅ Finished move mouse to pixel: {position}')
                    return ActionResult(extracted_content=f'Successfully move mouse to {position}')
                else:
                    msg = f'❌ Failed move mouse to pixel with position: {position}'
                    return ActionResult(extracted_content=msg, error=msg)
            except Exception as e:
                msg = f'❌ An error occurred: {str(e)}'
                logging.error(msg)
                return ActionResult(extracted_content=msg, error=msg)

        @self.registry.action('Scroll up', param_model=ScrollUpAction)
        async def scroll_up(position, dx: int = -20, dy: int = 20):
            try:
                platform_actions = _get_platform_actions()
                amount = dy
                if platform.system() == "Darwin":
                    scroll_successful = await platform_actions.scroll_up(amount)
                else:
                    scroll_successful = await platform_actions.scroll(position[0], position[1], amount)
                if scroll_successful:
                    logging.info(f'✅ Scrolled up by {amount}')
                    return ActionResult(extracted_content=f'Successfully scrolled up by {amount}')
                else:
                    msg = f'❌ Scroll up failed'
                    return ActionResult(extracted_content=msg, error=msg)
            except Exception as e:
                msg = f'❌ An error occurred: {str(e)}'
                logging.error(msg)
                return ActionResult(extracted_content=msg, error=msg)

        @self.registry.action('Scroll down', param_model=ScrollDownAction)
        async def scroll_down(position, dx: int = -20, dy: int = 20):
            try:
                platform_actions = _get_platform_actions()
                amount = dy
                if platform.system() == "Darwin":
                    scroll_successful = await platform_actions.scroll_down(amount)
                else:
                    scroll_successful = await platform_actions.scroll(position[0], position[1], -amount)
                if scroll_successful:
                    logging.info(f'✅ Scrolled down by {amount}')
                    return ActionResult(extracted_content=f'Successfully scrolled down by {amount}')
                else:
                    msg = f'❌ Scroll down failed'
                    return ActionResult(extracted_content=msg, error=msg)
            except Exception as e:
                msg = f'❌ An error occurred: {str(e)}'
                logging.error(msg)
                return ActionResult(extracted_content=msg, error=msg)

        @self.registry.action('Tell the short memory that you are recording information', param_model=RecordAction)
        async def record_info(text: str, file_name: str):
            return ActionResult(extracted_content=f'{file_name}: {text}')

        @self.registry.action('Wait', param_model=NoParamsAction)
        async def wait():
            return ActionResult(extracted_content='Waiting')

    def action(self, description: str, **kwargs):
        return self.registry.action(description, **kwargs)

    @time_execution_async('--multi-act')
    async def multi_act(self, actions: list[ActionModel], ui_tree_builder=None) -> list[ActionResult]:
        results = []
        for i, action in enumerate(actions):
            results.append(await self.act(action, ui_tree_builder))
            await asyncio.sleep(0.5)

            logger.debug(f'Executed action {i + 1} / {len(actions)}')
            if results[-1].is_done or results[-1].error or i == len(actions) - 1:
                break

        return results

    @time_execution_sync('--act')
    async def act(self, action: ActionModel, ui_tree_builder=None) -> ActionResult:
        try:
            for action_name, params in action.model_dump(exclude_unset=True).items():
                if params is not None:
                    result = await self.registry.execute_action(action_name, params, ui_tree_builder=ui_tree_builder)
                    if isinstance(result, str):
                        return ActionResult(extracted_content=result)
                    elif isinstance(result, ActionResult):
                        return result
                    elif result is None:
                        return ActionResult()
                    else:
                        raise ValueError(f'Invalid action result type: {type(result)} of {result}')
            return ActionResult()
        except Exception as e:
            msg = f'Error executing action: {str(e)}'
            logger.error(msg)
            return ActionResult(extracted_content=msg, error=msg)
