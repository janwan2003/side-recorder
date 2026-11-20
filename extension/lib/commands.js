// The command reference shown in the step editor. Names and argument meanings follow the .side format;
// the descriptions are our own words.
// t = what the target field holds, v = what the value field holds ('' = unused).

const L = 'locator';
export const COMMANDS = {
  open: { t: 'URL', v: '', d: 'Opens a URL. A path like /login is resolved against the project base URL.' },
  click: { t: L, v: '', d: 'Clicks an element, after waiting for it to appear.' },
  clickAt: { t: L, v: 'x,y offset', d: 'Clicks an element (the offset is kept for export).' },
  doubleClick: { t: L, v: '', d: 'Double-clicks an element.' },
  doubleClickAt: { t: L, v: 'x,y offset', d: 'Double-clicks an element.' },
  type: { t: L, v: 'text', d: 'Replaces the value of an input or text area with the text.' },
  sendKeys: { t: L, v: 'keys', d: 'Types keys into an element without clearing it. ${KEY_ENTER}, ${KEY_TAB} and similar name special keys.' },
  editContent: { t: L, v: 'text', d: 'Sets the text of a contenteditable element.' },
  select: { t: L, v: 'option', d: 'Picks an option in a drop-down: label=Text, value=v, index=2 or id=x.' },
  addSelection: { t: L, v: 'option', d: 'Adds an option to a multi-select.' },
  removeSelection: { t: L, v: 'option', d: 'Removes an option from a multi-select.' },
  check: { t: L, v: '', d: 'Ticks a checkbox or radio button if it is not ticked.' },
  uncheck: { t: L, v: '', d: 'Unticks a checkbox if it is ticked.' },
  submit: { t: L, v: '', d: 'Submits a form.' },
  mouseOver: { t: L, v: '', d: 'Moves the mouse over an element (fires mouseover and mouseenter).' },
  mouseOut: { t: L, v: '', d: 'Moves the mouse off an element.' },
  mouseDown: { t: L, v: '', d: 'Presses the mouse button on an element.' },
  mouseDownAt: { t: L, v: 'x,y offset', d: 'Presses the mouse button on an element.' },
  mouseUp: { t: L, v: '', d: 'Releases the mouse button on an element.' },
  mouseUpAt: { t: L, v: 'x,y offset', d: 'Releases the mouse button on an element.' },
  mouseMoveAt: { t: L, v: 'x,y offset', d: 'Moves the mouse on an element.' },
  pause: { t: 'milliseconds', v: '', d: 'Waits for the given time.' },
  setWindowSize: { t: 'WIDTHxHEIGHT', v: '', d: 'Resizes the browser window, e.g. 1280x800.' },
  setSpeed: { t: 'milliseconds', v: '', d: 'Sets a delay between steps.' },
  selectFrame: { t: 'frame', v: '', d: 'Switches into an iframe (index=0, a locator) or back with relative=top / relative=parent.' },
  selectWindow: { t: 'handle', v: '', d: 'Switches to another window (not supported in replay yet).' },
  close: { t: '', v: '', d: 'Closes the current window (not supported in replay yet).' },
  run: { t: 'test name', v: '', d: 'Runs another test of this project at this point.' },
  executeScript: { t: 'script', v: 'variable', d: 'Runs JavaScript in the page; a returned value is stored in the variable.' },
  runScript: { t: 'script', v: '', d: 'Runs JavaScript in the page.' },
  executeAsyncScript: { t: 'script', v: 'variable', d: 'Runs JavaScript in the page and waits for the promise it returns.' },
  store: { t: 'value', v: 'variable', d: 'Stores a value in a variable. Use it later as ${name}.' },
  storeText: { t: L, v: 'variable', d: 'Stores the visible text of an element.' },
  storeValue: { t: L, v: 'variable', d: 'Stores the value of an input.' },
  storeTitle: { t: '', v: 'variable', d: 'Stores the page title.' },
  storeAttribute: { t: 'locator@attribute', v: 'variable', d: 'Stores an attribute, e.g. css=a.logo@href.' },
  storeXpathCount: { t: 'xpath', v: 'variable', d: 'Stores how many elements match an XPath.' },
  storeElementCount: { t: L, v: 'variable', d: 'Stores how many elements match a locator.' },
  echo: { t: 'message', v: '', d: 'Writes a message to the log.' },
  assert: { t: 'variable', v: 'expected', d: 'Checks that a variable equals the expected value.' },
  assertText: { t: L, v: 'text', d: 'Checks the visible text of an element. Stops the test on failure.' },
  assertNotText: { t: L, v: 'text', d: 'Checks an element does not have this text.' },
  assertTitle: { t: 'title', v: '', d: 'Checks the page title.' },
  assertValue: { t: L, v: 'value', d: 'Checks the value of an input.' },
  assertElementPresent: { t: L, v: '', d: 'Checks the element exists.' },
  assertElementNotPresent: { t: L, v: '', d: 'Checks the element does not exist.' },
  assertChecked: { t: L, v: '', d: 'Checks a checkbox is ticked.' },
  assertNotChecked: { t: L, v: '', d: 'Checks a checkbox is not ticked.' },
  assertEditable: { t: L, v: '', d: 'Checks an input is enabled and not read-only.' },
  assertNotEditable: { t: L, v: '', d: 'Checks an input is disabled or read-only.' },
  assertSelectedLabel: { t: L, v: 'label', d: 'Checks the label of the selected option.' },
  assertSelectedValue: { t: L, v: 'value', d: 'Checks the value of the selected option.' },
  assertNotSelectedValue: { t: L, v: 'value', d: 'Checks the selected option does not have this value.' },
  assertAlert: { t: 'text', v: '', d: 'Checks the text of the last alert.' },
  assertConfirmation: { t: 'text', v: '', d: 'Checks the text of the last confirm dialog.' },
  assertPrompt: { t: 'text', v: '', d: 'Checks the text of the last prompt dialog.' },
  chooseOkOnNextConfirmation: { t: '', v: '', d: 'Answers OK to the next confirm dialog (the default).' },
  chooseCancelOnNextConfirmation: { t: '', v: '', d: 'Answers Cancel to the next confirm dialog.' },
  answerOnNextPrompt: { t: 'answer', v: '', d: 'Types this answer into the next prompt dialog.' },
  chooseCancelOnNextPrompt: { t: '', v: '', d: 'Cancels the next prompt dialog.' },
  waitForElementPresent: { t: L, v: 'timeout ms', d: 'Waits until the element exists.' },
  waitForElementNotPresent: { t: L, v: 'timeout ms', d: 'Waits until the element is gone.' },
  waitForElementVisible: { t: L, v: 'timeout ms', d: 'Waits until the element is visible.' },
  waitForElementNotVisible: { t: L, v: 'timeout ms', d: 'Waits until the element is hidden.' },
  waitForElementEditable: { t: L, v: 'timeout ms', d: 'Waits until the input can be edited.' },
  waitForElementNotEditable: { t: L, v: 'timeout ms', d: 'Waits until the input cannot be edited.' },
  waitForText: { t: L, v: 'text', d: 'Waits until the element has this text.' },
  if: { t: 'condition', v: '', d: 'Runs the following steps if the JavaScript condition is true. Close with end.' },
  elseIf: { t: 'condition', v: '', d: 'Part of an if block.' },
  else: { t: '', v: '', d: 'Part of an if block.' },
  while: { t: 'condition', v: '', d: 'Repeats the following steps while the condition is true. Close with end.' },
  do: { t: '', v: '', d: 'Starts a block that repeats until repeatIf is false.' },
  repeatIf: { t: 'condition', v: '', d: 'Ends a do block; repeats while the condition is true.' },
  times: { t: 'count', v: '', d: 'Repeats the following steps a number of times. Close with end.' },
  forEach: { t: 'array variable', v: 'item variable', d: 'Repeats the following steps for each item of an array variable. Close with end.' },
  end: { t: '', v: '', d: 'Ends an if, while, times or forEach block.' },
};

// verify* commands behave like assert* but the test continues after a failure.
for (const [name, spec] of Object.entries({ ...COMMANDS })) {
  if (name.startsWith('assert')) {
    const v = 'verify' + name.slice('assert'.length);
    COMMANDS[v] = { ...spec, d: spec.d.replace('Stops the test on failure.', '') + ' Continues after a failure.' };
  }
}

export const COMMAND_NAMES = Object.keys(COMMANDS).sort((a, b) => a.localeCompare(b));

export function isDisabled(cmd) {
  return typeof cmd.command === 'string' && cmd.command.startsWith('//');
}

// Locator strings: "id=x", "name=x", "css=...", "xpath=...", "linkText=...", "partialLinkText=..." and a
// bare string starting with "//" (an XPath) as Selenium IDE accepts.
export function parseLocator(target) {
  const t = String(target || '').trim();
  if (t.startsWith('//') || t.startsWith('(//')) return { type: 'xpath', value: t };
  const m = /^(id|name|css|xpath|linkText|link|partialLinkText|identifier)=([\s\S]*)$/.exec(t);
  if (!m) return { type: 'css', value: t, implicit: true };
  const type = m[1] === 'link' ? 'linkText' : m[1] === 'identifier' ? 'id' : m[1];
  return { type, value: m[2] };
}

// Key names used in sendKeys values, mapped to KeyboardEvent.key.
export const KEYS = {
  ENTER: 'Enter', RETURN: 'Enter', TAB: 'Tab', ESC: 'Escape', ESCAPE: 'Escape', BACKSPACE: 'Backspace',
  BACK_SPACE: 'Backspace', DELETE: 'Delete', DEL: 'Delete', SPACE: ' ', UP: 'ArrowUp', DOWN: 'ArrowDown',
  LEFT: 'ArrowLeft', RIGHT: 'ArrowRight', ARROW_UP: 'ArrowUp', ARROW_DOWN: 'ArrowDown', ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight', HOME: 'Home', END: 'End', PAGE_UP: 'PageUp', PAGE_DOWN: 'PageDown', SHIFT: 'Shift',
  CONTROL: 'Control', CTRL: 'Control', ALT: 'Alt', META: 'Meta', COMMAND: 'Meta', INSERT: 'Insert',
  F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6', F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
};

// Splits "abc${KEY_ENTER}x" into [{text:'abc'},{key:'Enter'},{text:'x'}].
export function splitKeys(value) {
  const parts = [];
  const re = /\$\{KEY_([A-Z0-9_]+)\}/g;
  let last = 0;
  let m;
  while ((m = re.exec(value))) {
    if (m.index > last) parts.push({ text: value.slice(last, m.index) });
    parts.push(KEYS[m[1]] ? { key: KEYS[m[1]], name: m[1] } : { text: m[0] });
    last = re.lastIndex;
  }
  if (last < value.length) parts.push({ text: value.slice(last) });
  return parts;
}
