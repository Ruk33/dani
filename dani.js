// next steps
// - headless using puppeteer
// - if a file of instructions fail, report and continue with the next file
// - if running headless, skip files containing "intervention" instructions
// - count tests/instruction

const default_tries = 99;
const wait_before_each_action = 650;

const extract_selector = (from) => {
  const selector =
    /\s(?<selector>(([.#])?[a-z0-9_-]*(\:[a-z0-9_-]+(\(.*?\))?|\[.*?\])?\>?)+)((\swith\s(?<with>(.+)))?)/i;
  const result = selector.exec(from);
  return {
    selector: (result.groups?.selector || "").trim(),
    with: result.groups?.with,
  };
};

const parse_type_in = (instruction) => {
  const selector =
    /(type|choose)\s\[(?<toType>(.*?))\]\sin\s(?<selector>(([.#])?[a-z0-9_-]*(\:[a-z0-9_-]+(\(.*?\))?|\[.*?\])?\>?)+)((\swith\s(?<with>(.+)))?)/i;
  const result = selector.exec(instruction);
  return {
    toType: result?.groups?.toType || "",
    selector: (result?.groups?.selector || "").trim(),
    with: result?.groups?.with,
  };
};

const copy_content = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    document.getElementById("success").textContent =
      "Copied selector to clipboard.";
  } catch (err) {
    document.getElementById("error").textContent =
      `Unable to copy "${text}" to clipboard.`;
  }
};

const clear_cookies = () => {
  const now = new Date().toUTCString();
  document.cookie.split(";").forEach((c) => {
    document.cookie = c
      .replace(/^ +/, "")
      .replace(/=.*/, "=;expires=" + now + ";path=/");
  });
};

const is_element_hidden = (element) => {
  if (!element) return true;

  const styles = element.computedStyleMap();
  return (
    styles.get("display").value === "none" ||
    styles.get("opacity").value === 0 ||
    styles.get("visibility").value === "hidden"
  );
};

const get_selector = (element) => {
  if (element.value)
    return {
      selector: element.tagName.toLowerCase(),
      with: element.value,
      fullSelector: `${element.tagName.toLowerCase()} with ${element.value}`,
    };

  if (element.placeholder)
    return {
      selector: element.tagName.toLowerCase(),
      with: element.placeholder,
      fullSelector: `${element.tagName.toLowerCase()} with ${element.placeholder}`,
    };

  if (element.textContent)
    return {
      selector: element.tagName.toLowerCase(),
      with: element.textContent,
      fullSelector: `${element.tagName.toLowerCase()} with ${element.textContent}`,
    };

  if (element.id)
    return {
      selector: `${element.tagName.toLowerCase()}[id=${element.id}]`,
      with: undefined,
      fullSelector: `${element.tagName.toLowerCase()}[id=${element.id}]`,
    };

  if (element.className)
    return {
      selector: `${element.tagName.toLowerCase()}[class='${element.className}']`,
      with: undefined,
      fullSelector: `${element.tagName.toLowerCase()}[class='${element.className}']`,
    };

  return {
    selector: "",
    with: undefined,
    fullSelector: "",
  };
};

const find_selector_for = (element) => {
  const possibleSelector = get_selector(element);
  if (possibleSelector.selector) {
    const elements = find_element(
      possibleSelector.selector,
      possibleSelector.with,
      true,
    );
    // check if [1...] are children of [0]
    // console.log(possibleSelector, elements);
    // if (elements.length === 1 && elements[0] === element) return possibleSelector;
    let isValid = true;
    for (let i = 1; i < elements.length; i++) {
      if (!elements[0].contains(elements[i])) {
        isValid = false;
        break;
      }
    }
    if (isValid) return possibleSelector;
  }

  let selector = "";
  const nodes = document.querySelectorAll(element.tagName);
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i] !== element)
      continue;
    selector = `${element.tagName}:nth-of-type(${i + 1})`;
    break;
  }

  return {
    selector: selector,
    with: undefined,
    fullSelector: selector,
  };
};

const find_element = (query, content, find_all) => {
  const elements = document.querySelectorAll(query);
  let result = [];
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    if (element) {
      if (content !== undefined) {
        let matches = false;
        if (element.getAttribute("textContent") === content) matches = true;
        if (element.textContent && element.textContent === content)
          matches = true;
        if (element.value && element.value === content) matches = true;
        if (element.placeholder && element.placeholder === content)
          matches = true;
        if (!matches) continue;
      }
      if (!find_all) {
        // scroll to node
        element.scrollIntoView(true);
        // make it so the element appears in the center of view port.
        const viewportH = Math.max(
          document.documentElement.clientHeight,
          window.innerHeight || 0,
        );
        window.scrollBy(0, -viewportH / 2);
        // red highlight
        const bg = element.style.background;
        element.style.background = "red";
        setTimeout(() => {
          element.style.background = bg;
        }, 500);
      }

      if (find_all) result.push(element);
      else return element;
    }
  }
  if (find_all) return result;
};

const type_in = (input, what, tries) => {
  const prevValue = input.value;
  let nativeTextAreaValueSetter;
  if (input.getAttribute("contentEditable") === "true") {
    input.textContent = what;
    complete_instruction();
    setTimeout(() => {
      handle_instruction(default_tries);
    }, wait_before_each_action
  );
    return;
  } else {
    nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
      input.__proto__,
      "value",
    ).set;
  }
  nativeTextAreaValueSetter.call(input, what);
  input.dispatchEvent(
    new Event("input", {
      bubbles: true,
    }),
  );
  input.dispatchEvent(
    new Event("change", {
      bubbles: true,
    }),
  );
  // if the value wasn't successfully updated, go back
  // to the previous value. this can happen with select
  // inputs, if the option isn't valid, the select won't be
  // correctly updated.
  if (input.value !== what) {
    nativeTextAreaValueSetter.call(input, prevValue);
    input.dispatchEvent(
      new Event("input", {
        bubbles: true,
      }),
    );
    input.dispatchEvent(
      new Event("change", {
        bubbles: true,
      }),
    );
    setTimeout(() => {
      handle_instruction(tries - 1);
    }, 500);
    return;
  }
  complete_instruction();
  setTimeout(() => {
    handle_instruction(default_tries);
  }, wait_before_each_action
);
};

const update_logs = () => {
  const instructions = JSON.parse(localStorage.getItem("instructions") || "[]");
  const next = instructions.find((instruction) => !instruction.done);

  const log = document.getElementById("instructions");
  log.value = "";
  const resizeOperation = instructions.find((instruction) =>
    instruction.instruction.startsWith("resize "),
  );
  for (let i = 0; i < instructions.length; i++) {
    if (!window.opener && resizeOperation)
      log.value += `${instructions[i].instruction}\n`;
    else if (instructions[i] === next)
      log.value += `🛠️ ${instructions[i].instruction}\n`;
    else if (instructions[i].done)
      log.value += `✅ ${instructions[i].instruction}\n`;
    else log.value += `😴 ${instructions[i].instruction}\n`;
  }

  document.getElementById("success").textContent = "";
  document.getElementById("error").textContent = "";

  if (!next) {
    document.getElementById("success").textContent = "All done!";
    // setTimeout(() => {
    log.value = "";
    for (let i = 0; i < instructions.length; i++) {
      log.value += `${instructions[i].instruction}\n`;
    }
    localStorage.removeItem("instructions");
    // }, 1000);

    return;
  }
};

const complete_instruction = () => {
  const instructions = JSON.parse(localStorage.getItem("instructions") || "[]");
  const next = instructions.find((instruction) => !instruction.done);
  if (!next) return;
  console.log(`${next.instruction} done`);
  next.done = true;
  localStorage.setItem("instructions", JSON.stringify(instructions));
  update_logs();
};

const complete_intervention = () => {
  complete_instruction();
  document
    .getElementById("play")
    .removeEventListener("click", complete_intervention);
  document.getElementById("play").addEventListener("click", handlePlay);
  setTimeout(() => {
    handle_instruction(default_tries);
  }, wait_before_each_action
);
};

const testAll = async () => {
  const response = await fetch("/api/qa/test");
  const tests = await response.json();
  const instructions = tests.instructions;
  document.getElementById("instructions").value = instructions;
  handlePlay();
};

const handle_instruction = (tries) => {
  const instructions = JSON.parse(localStorage.getItem("instructions") || "[]");
  const next = instructions.find((instruction) => !instruction.done);

  // No more instructions to run, just replace the 
  // textarea with whatever the user typed before
  // running all the actions.
  if (!next) {
    document.getElementById("instructions").value =
      localStorage.getItem("instructions_draft") + "\n";
    return;
  }

  // Out of tries, report error.
  if (!tries) {
    let name = "";
    const nextIndex = instructions.findIndex(
      (instruction) => !instruction.done,
    );
    let nameIndex = 0;
    for (let i = nextIndex; i >= 0; i--) {
      if (!instructions[i].instruction.startsWith("name ")) continue;
      nameIndex = i;
      const fullName = instructions[i].instruction.split(" ")[1];
      const line = nextIndex - nameIndex;
      name = `Error in <a href="vscode://file/${fullName}:${line}">${fullName}</a> line ${line}`;
      break;
    }
    document.getElementById("error").innerHTML =
      `Unable to complete: ${next.instruction}. ${name}`;
    localStorage.removeItem("instructions");
    const log = document.getElementById("instructions");
    log.value = "";
    for (let i = 0; i < instructions.length; i++) {
      log.value += `${instructions[i].instruction}\n`;
    }
    return;
  }

  const params = next.instruction.split(" ");
  const command = params[0];

  // Ignore comments.
  if (command.startsWith("//")) {
    complete_instruction();
    handle_instruction(default_tries);
    return;
  }

  switch (command) {
    case "test":
      {
        testAll();
      }
      break;
    case "name":
      {
        complete_instruction();
        handle_instruction(default_tries);
      }
      break;
    case "wait":
      {
        setTimeout(() => {
          complete_instruction();
          handle_instruction(default_tries);
        }, Number(params[1]));
      }
      break;
    case "click":
      {
        const query = extract_selector(next.instruction);
        const element = find_element(query.selector, query.with);
        if (!element) {
          setTimeout(() => {
            handle_instruction(tries - 1);
          }, 500);
          return;
        }
        element.click();
        complete_instruction();
        setTimeout(() => {
          handle_instruction(default_tries);
        }, wait_before_each_action
      );
      }
      break;
    case "type":
    case "choose":
      {
        const query = parse_type_in(next.instruction);
        const element = find_element(query.selector, query.with);
        if (!element) {
          setTimeout(() => {
            handle_instruction(tries - 1);
          }, 500);
          return;
        }
        type_in(element, query.toType, tries);
      }
      break;
    case "don't":
    case "dont":
    case "find":
      {
        const query = extract_selector(next.instruction);
        const element = find_element(query.selector, query.with);
        // don't find element.
        if (command !== "find" && !is_element_hidden(element)) {
          setTimeout(() => {
            handle_instruction(tries - 1);
          }, 500);
          return;
        }
        // don't find element.
        if (command !== "find" && is_element_hidden(element)) {
          complete_instruction();
          setTimeout(() => {
              handle_instruction(default_tries);
            }, wait_before_each_action
          );
          return;
        }

        // find element.
        if (is_element_hidden(element)) {
          setTimeout(() => {
            handle_instruction(tries - 1);
          }, 500);
          return;
        }
        complete_instruction();
        setTimeout(() => {
          handle_instruction(default_tries);
        }, wait_before_each_action
      );
      }
      break;
    case "reload":
      {
        complete_instruction();
        location.reload();
      }
      break;
    case "visit":
      {
        complete_instruction();
        window.location.href = params[1];
      }
      break;
    case "intervention":
      {
        document.getElementById("error").textContent =
          `User intervention requested: ${next.instruction.replace("intervention ", "")}. Once YOU finished the action, click ▶️ to continue.`;
        document
          .getElementById("play")
          .removeEventListener("click", handlePlay);
        document
          .getElementById("play")
          .addEventListener("click", complete_intervention);
      }
      break;
    case "clear":
      {
        const what = params[1];
        switch (what) {
          case "storage":
            {
              const instructions = JSON.parse(
                localStorage.getItem("instructions") || "[]",
              );
              const instructions_draft =
                localStorage.getItem("instructions_draft");
              sessionStorage.clear();
              localStorage.clear();
              localStorage.setItem(
                "instructions",
                JSON.stringify(instructions),
              );
              localStorage.setItem("instructions_draft", instructions_draft);
              complete_instruction();
              location.reload();
            }
            break;
          case "cookies":
            clear_cookies();
            complete_instruction();
            location.reload();
            break;
          case "all":
            {
              const instructions = JSON.parse(
                localStorage.getItem("instructions") || "[]",
              );
              const instructions_draft =
                localStorage.getItem("instructions_draft");
              sessionStorage.clear();
              localStorage.clear();
              clear_cookies();
              localStorage.setItem(
                "instructions",
                JSON.stringify(instructions),
              );
              localStorage.setItem("instructions_draft", instructions_draft);
              complete_instruction();
              location.reload();
            }
            break;
          default:
            alert("clear needs to be 'storage', 'cookies' or 'all'");
            break;
        }
      }
      break;
    case "resize":
      {
        const width = params[1];
        const height = params[2];
        resizeTo(Number(width), Number(height));
        complete_instruction();
        setTimeout(() => {
          handle_instruction(default_tries);
        }, wait_before_each_action
      );
      }
      break;
    default:
      {
        alert(`command ${command} not found`);
      }
      break;
  }
};

const handlePlay = () => {
  const rawInstructions = document.getElementById("instructions").value;

  const instructions = rawInstructions
    .split("\n")
    .map((instruction) => instruction.trim())
    .filter((instruction) => instruction.length > 0)
    // .filter((instruction) => !instruction.startsWith("//"))
    .map((instruction) => ({
      instruction: instruction
        .replace("🛠️ ", "")
        .replace("✅ ", "")
        .replace("😴 ", ""),
      done: false,
    }));
  localStorage.setItem("instructions", JSON.stringify(instructions));

  const resizeOperation = instructions.find((instruction) =>
    instruction.instruction.startsWith("resize "),
  );
  if (!window.opener && resizeOperation) {
    window.open("/", "", "left=0,top=0");
    return;
  }

  update_logs();
  handle_instruction(default_tries);
};

const handlePause = () => {
  const instructions = JSON.parse(
    localStorage.getItem("instructions") || "[]",
  ).map((instruction) => ({ ...instruction, done: true }));
  localStorage.setItem("instructions", JSON.stringify(instructions));
  update_logs();
  document.getElementById("success").textContent = "Paused";
};

const handle_restart = () => {
  const instructions = JSON.parse(localStorage.getItem("instructions") || "[]");
  const all_restarted = instructions.map((instruction) => ({
    ...instruction,
    done: false,
  }));
  localStorage.setItem("instructions", JSON.stringify(all_restarted));
  location.reload();
};

const open_documentation = () => {
  document.getElementById("documentation-dialog").showModal();
};

const showNodeWithMouse = (e) => {
  if (
    !document.getElementById("dani").classList.contains("dani-selector-enabled")
  )
    return;
  const allSelected = document.getElementsByClassName("dani-selector");
  for (const selected of allSelected)
    selected.classList.remove("dani-selector");
  e.target.classList.add("dani-selector");
};

const copySelectorForNodeWithMouse = (e) => {
  if (
    !document.getElementById("dani").classList.contains("dani-selector-enabled")
  )
    return;

  e.preventDefault();
  e.stopImmediatePropagation();
  e.stopPropagation();

  document.getElementById("dani").classList.remove("dani-selector-enabled");

  const selected = document.querySelector(".dani-selector");
  if (!selected) return;
  selected.classList.remove("dani-selector");
  const result = find_selector_for(selected);
  // if (
  //   !result.selector ||
  //   find_element(result.selector, result.with) !== selected
  // ) {
  //   document.getElementById("error").textContent =
  //     "Unable to find selector for node.";
  //   return;
  // }
  document.getElementById("error").textContent = "";
  copy_content(result.fullSelector);

  const prevent = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();
    setTimeout(() => {
      selected.removeEventListener("mouseup", prevent);
      selected.removeEventListener("pointerup", prevent);
      selected.removeEventListener("click", prevent);
    }, 100);
  };
  selected.addEventListener("mouseup", prevent);
  selected.addEventListener("pointerup", prevent);
  selected.addEventListener("click", prevent);
};

const create_menu = () => {
  const menu = document.createElement("div");
  menu.id = "dani";
  menu.innerHTML = `
  <style>
  #dani {
    transition: all 200ms; 
    position: fixed;
    height: calc(100vh - 20px); 
    top: -1px; 
    right: 0; 
    padding: 10px;
    border: 1px solid black; 
    background-color: white; 
    z-index: 999; 
    pointer-events: all;
  }
  .dani-selector {
    border: 2px solid red !important;
  }
  .dani-selector-enabled {}
  .dani-hide {
    transform: translateX(295px);
  }
  </style>
  <dialog id="documentation-dialog">
    <pre style="padding: 10px; border: 2px solid black;">
wait (ms)
    Blocks and waits ms.
    Example: wait 2000

click (css query)
    Click element found using css query.
    Example: click #button-with-id

click (css query) with (text content)
    Click element found using css query and checking for it's content/value.
    Example: click button with Checkout
    Example: click input with 42

type ([what]) in (css query)
choose ([what]) in (css query)
    Types text in element found using css query.
    Choose is just an alias. It's mean to be used for select inputs (for instance, the quantity selector in the cart slider)
    Example: type [42] in #input
    Example: choose [2] in select

find (css query)
    Finds and ensures element with css query exists.
    Example: find #div-with-id

find (css query) with (text content)
    Finds element using css query ensuring it's content/value matches.
    Example: find #div with this text
    Example: find #input with 42

don't find (css query)
don't find (css query) with (text content)
    Make sure an element isn't found or visible.
    Example: don't find div with Some content
    Example: don't find #successMessage

reload
    Reloads page.
    Example: reload

resize width height
    Resize window to the specified dimensions
    Example: resize 800 600

visit (url)
    Visits url/uri.
    Example: visit /products

clear (storage|cookies|all)
    Clears storage, cookies, or both and reloads the page.
    Example: clear cookies
    Example: clear all

intervention (helpful message)
    Blocks and waits for user to intervene.
    Example: intervention upload file for product
    </pre>
    <form method="dialog" style="position: absolute; top: 10px; right: 10px;">
      <button>❌</button>
    </form>
  </dialog>
  <div style="display: flex; flex-direction: column; height: 100%;">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 10px;">
      <button id="toggle-dani-menu" type="button">👉</button>
      <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
        <button type="button" id="play">▶️</button>
        <button type="button" id="pause">⏸️</button>
        <!--<button type="button" id="restart">🔄</button>-->
        <button type="button" id="select-node">🎯</button>
        <button type="button" id="documentation">📘</button>
      </div>
    </div>
    <div id="error" style="color: red; width: 300px; font-family: courier; font-size: 12px;"></div>
    <div id="success" style="color: green; width: 300px;"></div>
    <textarea id="instructions" style="flex: 1; width: 300px; padding: 10px; font-size: 14px; line-height: 28px; font-family: courier; border: 1px solid black; border-radius: 5px;" placeholder="Enter commands."></textarea>
  </div>`;
  document.body.append(menu);
  document.getElementById("toggle-dani-menu").addEventListener("click", () => {
    document.getElementById("dani").classList.toggle("dani-hide");
  });
  document.getElementById("play").addEventListener("click", handlePlay);
  document.getElementById("pause").addEventListener("click", handlePause);
  // document.getElementById("restart").addEventListener("click", handle_restart);
  document
    .getElementById("documentation")
    .addEventListener("click", open_documentation);
  document.getElementById("select-node").addEventListener("click", () => {
    setTimeout(() => {
      document.getElementById("dani").classList.add("dani-selector-enabled");
    }, 10);
  });
  document.addEventListener("mousemove", showNodeWithMouse);
  document.addEventListener("mousedown", copySelectorForNodeWithMouse);
  document.getElementById("instructions").addEventListener("input", (e) => {
    const content = e.target.value;
    const is_running =
      content.includes("🛠️") ||
      content.includes("✅") ||
      content.includes("😴");
    if (is_running)
      return;
    localStorage.setItem("instructions_draft", content);
  });
};

const run_pending_commands = () => {
  update_logs();
  const instructions = JSON.parse(localStorage.getItem("instructions") || "[]");
  const resizeOperation = instructions.find((instruction) =>
    instruction.instruction.startsWith("resize "),
  );
  if (!window.opener && resizeOperation) return;
  setTimeout(() => {
    handle_instruction(default_tries);
  }, wait_before_each_action
);
};

window.addEventListener("load", () => {
  create_menu();
  setTimeout(run_pending_commands, 2000);
});
