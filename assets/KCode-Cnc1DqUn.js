import{a as e}from"./rolldown-runtime-B0Z9INg1.js";import{i as t}from"./react-CgaLaEa2.js";import{G as n,H as r,j as i,t as a}from"./os-D3s1VfpL.js";import{O as o,Z as s,it as c}from"./windows-VY-8Y0xY.js";import{t as l}from"./arrow-right-CHNq3qzw.js";import{t as ee}from"./chevron-down-Ckv7OeRf.js";import{t as u}from"./circle-check-BzuKG7gG.js";import{t as d}from"./circle-COcnn321.js";import{t as f}from"./clock-3--uB6CnpR.js";import{t as te}from"./eraser-CFDwZJYg.js";import{t as ne}from"./eye-DX85DAQ8.js";import{t as re}from"./folder-open-ClY0Inoe.js";import{t as ie}from"./list-checks-ZcOaKui2.js";import{t as ae}from"./panel-left-9WrbIYiQ.js";import{t as oe}from"./pen-line-xAo0L2rb.js";import{t as se}from"./play-BXnkmq0V.js";import{t as ce}from"./rotate-ccw-CxI9OlVn.js";import{t as le}from"./save-0Q1y_fDO.js";import{t as ue}from"./square-BfMFK_kv.js";import{t as p}from"./jsx-runtime-B74pBk57.js";import{n as de,t as fe}from"./path-CtZiOU3c.js";import{$ as m,mt as pe}from"./index-CfOd47G4.js";import{a as me}from"./appTools-BuwPAJlj.js";import{n as h,t as he}from"./kernel-CwMa3k2i.js";import{Ct as g,G as ge,St as _e,U as _}from"./dist-D7HjTpXA.js";import{t as ve}from"./CodeEditor-mPefb8gm.js";var v={name:`flame`,size:24,node:[[`path`,{d:`M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4`,key:`1slcih`}]]};v.node;var y=c(v),ye={name:`lightbulb`,size:24,node:[[`path`,{d:`M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5`,key:`1gvzjb`}],[`path`,{d:`M9 18h6`,key:`x1upvd`}],[`path`,{d:`M10 22h4`,key:`ceow96`}]]};ye.node;var be=c(ye),b={name:`panel-left-close`,size:24,node:[[`rect`,{width:`18`,height:`18`,x:`3`,y:`3`,rx:`2`,key:`afitv7`}],[`path`,{d:`M9 3v18`,key:`fh3hqa`}],[`path`,{d:`m16 15-3-3 3-3`,key:`14y99z`}]],aliases:[`sidebar-close`]};b.node;var xe=c(b),x=e(t(),1),S=e=>typeof e==`string`&&e.trim()?e.trim():void 0;function Se(e){return{lessons:async t=>e.lessons({course:S(t.course),language:S(t.language),query:S(t.query)}),open:async t=>(e.open(String(t.lesson??``)),{shown:!0}),run:async t=>{let n=String(t.code??``);if(!n.trim())throw Error(`Give the code to run.`);return{language:e.language(),...await e.run(n)}},check:async()=>e.check(),hint:async()=>e.hint(),progress:async()=>e.progress(),set_code:async t=>{let n=String(t.code??``);if(!n.trim())throw Error(`Give the code to put in the editor.`);return{set:!0,...e.setCode(n)}}}}var C=`KCHECK`;function Ce(e,t){return`def _kc_harness(_payload):
    import json as _json, io as _io, contextlib as _ctx, traceback as _tb
    _data = _json.loads(_payload)
    _g = globals()
    _g["OUTPUT"] = _data["output"]
    _rows = []
    for _label, _src in _data["checks"]:
        _buf = _io.StringIO()
        try:
            with _ctx.redirect_stdout(_buf), _ctx.redirect_stderr(_buf):
                exec(compile(_src, "<check>", "exec"), _g)
            _rows.append([_label, True, ""])
        except BaseException as _e:
            _detail = f"{type(_e).__name__}: {_e}"
            if isinstance(_e, AssertionError):
                _line = ""
                for _fr in _tb.extract_tb(_e.__traceback__):
                    if _fr.filename == "<check>":
                        _lines = _src.splitlines()
                        if 0 < _fr.lineno <= len(_lines):
                            _line = _lines[_fr.lineno - 1].strip()
                _detail = str(_e) or ("did not hold: " + _line if _line else "did not hold")
            _rows.append([_label, False, _detail])
    print("\\x1eKCHECK" + _json.dumps(_rows))

_kc_harness(${JSON.stringify(JSON.stringify({checks:e.map(e=>[e.label,e.test]),output:t}))})
del _kc_harness
`}function we(e){let t=e.lastIndexOf(C);if(t<0)return null;let n=e.slice(t+7).split(`
`)[0];try{return JSON.parse(n).map(([e,t,n])=>({label:e,ok:t,detail:n}))}catch{return null}}function Te(e){let t=e.length,n=e.filter(e=>e.ok).length,r=t>0&&n===t,i;return i=t===0?`No checks`:r?t===1?`The check passed`:`All ${t} checks passed`:n===0?t===1?`The check did not pass yet`:`None of the ${t} checks passed yet`:`${n} of ${t} checks passed`,{passed:n,total:t,allPassed:r,headline:i}}function Ee(e){let t=null;for(let n of e.matchAll(/File "<cell>", line (\d+)/g))t=Number(n[1]);return t}function De(e){return e.split(`
`).some(e=>/(^|[^\w.])input\s*\(/.test(e.replace(/#.*$/,``)))}function Oe(e){return`def _kc_install_input(_payload):
    import builtins as _b, json as _json
    _answers = _json.loads(_payload)
    _state = {"i": 0}
    def _input(prompt=""):
        if _state["i"] >= len(_answers):
            raise EOFError("input() was called more often than there are answers. Add a line to the 'input() answers' box.")
        _a = _answers[_state["i"]]
        _state["i"] += 1
        print(str(prompt) + _a)
        return _a
    _b.input = _input

_kc_install_input(${JSON.stringify(JSON.stringify(e))})
del _kc_install_input
`}var w=p();function ke({dir:e,container:t,share:n,onChange:r,min:i=.2,max:a=.8,label:o}){let s=(0,x.useRef)(!1),c=e=>Math.min(a,Math.max(i,e));return(0,w.jsx)(`div`,{className:`kcd-divider ${e}`,role:`separator`,"aria-orientation":e===`col`?`vertical`:`horizontal`,"aria-label":o,"aria-valuenow":Math.round(n*100),"aria-valuemin":Math.round(i*100),"aria-valuemax":Math.round(a*100),tabIndex:0,onPointerDown:e=>{s.current=!0,e.currentTarget.setPointerCapture(e.pointerId)},onPointerMove:n=>{if(!s.current)return;let i=t.current?.getBoundingClientRect();i&&i.width&&i.height&&r(c(e===`col`?(n.clientX-i.left)/i.width:(n.clientY-i.top)/i.height))},onPointerUp:e=>{s.current=!1,e.currentTarget.releasePointerCapture(e.pointerId)},onPointerCancel:()=>{s.current=!1},onKeyDown:t=>{let i=t.shiftKey?.1:.03,a=e===`col`?`ArrowLeft`:`ArrowUp`,o=e===`col`?`ArrowRight`:`ArrowDown`;if(t.key===a)r(c(n-i));else if(t.key===o)r(c(n+i));else return;t.preventDefault()}})}var Ae=_e.define(),je=_.line({class:`kcd-errline`}),T=g.define({create:()=>_.none,update(e,t){t.docChanged&&(e=_.none);for(let n of t.effects){if(!n.is(Ae))continue;let r=n.value;e=r&&r>=1&&r<=t.state.doc.lines?_.set([je.range(t.state.doc.line(r).from)]):_.none}return e},provide:e=>ge.decorations.from(e)});function Me(e,t,n=!1){e.state.field(T,!1)||e.dispatch({effects:_e.appendConfig.of(T)});let r=t!==null&&t>=1&&t<=e.state.doc.lines;e.dispatch({effects:Ae.of(t),...n&&r?{selection:{anchor:e.state.doc.line(t).from},scrollIntoView:!0}:{}}),n&&e.focus()}var E=(...e)=>e.join(`

`),D=e=>"```python\n"+e.replace(/^\n+|\s+$/g,``)+"\n```",O=e=>"```javascript\n"+e.replace(/^\n+|\s+$/g,``)+"\n```";function k(e,...t){let n=String.raw({raw:e.raw},...t).replace(/^\s*\n/,``).replace(/\s+$/,``).split(`
`),r=Math.min(...n.filter(e=>e.trim()).map(e=>/^ */.exec(e)[0].length));return n.map(e=>e.slice(Math.min(r,/^ */.exec(e)[0].length))).join(`
`)+`
`}var A={id:`python-basics`,title:`Python basics`,language:`python`,blurb:`The language from the first print() to classes and files.`,chapters:[{id:`py-first`,title:`First steps`,lessons:[{id:`py-hello`,language:`python`,title:`Hello, Python`,level:`beginner`,minutes:4,text:E("A program is a list of instructions that Python carries out one after the other. `print()` shows something on the screen.","Text goes between quotes (a **string**); numbers do not. Python does arithmetic with the usual signs: `+ - * /`, and `**` for a power. Anything after a `#` is a comment: Python ignores it, people read it.",D(k`
              print("Hello, lab!")
              print(2 + 3 * 4)   # multiplication first: 14
            `),`Press **Run** (or Ctrl+Enter) to see what the code prints.`),task:`Print the number of seconds in one day: 24 hours of 60 minutes of 60 seconds. Let Python do the multiplication.`,code:k`
            print("Hello, lab!")
            print(2 + 3 * 4)

            # Your turn: print the seconds in a day
          `,hint:`Write print(24 * 60 * 60). You do not have to work out the answer yourself.`,solution:k`
            print("Hello, lab!")
            print(2 + 3 * 4)

            print(24 * 60 * 60)
          `,checks:[{label:`prints 86400`,test:`assert "86400" in OUTPUT`}]},{id:`py-variables`,language:`python`,title:`Variables and numbers`,level:`beginner`,minutes:6,text:E("A **variable** keeps a value under a name: `mass = 2.5`. Use the name later and Python uses the value. Names use letters, digits and `_`, and cannot start with a digit.","Whole numbers are `int`, numbers with a decimal point are `float`. `/` always gives a float; `//` divides and drops the fraction; `%` gives the remainder; `round(x, 3)` rounds.",D(k`
              mass = 2.5          # grams
              molar_mass = 18.0   # g/mol
              moles = mass / molar_mass
              print("moles =", round(moles, 4))
              print(7 // 2, 7 % 2, 3 ** 2)
            `)),task:"A volume of 250 mL of solution has a concentration of 0.10 mol/L. Set `moles` to the amount of substance in it (concentration times volume in litres).",code:k`
            volume_ml = 250
            concentration = 0.10   # mol/L

            moles = None   # replace None with a calculation
            print("moles =", moles)
          `,hint:`Convert millilitres to litres first: volume_ml / 1000. Then multiply by the concentration.`,solution:k`
            volume_ml = 250
            concentration = 0.10   # mol/L

            moles = concentration * volume_ml / 1000
            print("moles =", moles)
          `,checks:[{label:`moles is a number`,test:`assert isinstance(moles, (int, float))`},{label:`moles is 0.025`,test:`assert abs(moles - 0.025) < 1e-9, f"moles is {moles}"`}]},{id:`py-strings`,language:`python`,title:`Strings`,level:`beginner`,minutes:7,text:E("A string is a sequence of characters. Join strings with `+`, repeat them with `*`, count them with `len()`. Indexes start at **0**: `s[0]` is the first character, `s[-1]` the last, `s[1:4]` a slice.","Strings have methods, called with a dot: `.upper()`, `.lower()`, `.strip()` (removes spaces at both ends), `.split()` (cuts into a list of words), `.replace(old, new)`, `.startswith(text)`.",D(k`
              formula = "H2SO4"
              print(len(formula), formula[0], formula[-1], formula[1:3])
              print(formula.lower(), "-" * 10)
              print("a,b,c".split(","))
            `)),task:"The string `sample` has stray spaces and mixed case. Make `clean` the same text without the outer spaces and in capitals, and `first_word` its first word.",code:k`
            sample = "  Sodium chloride  "

            clean = ""
            first_word = ""
            print(repr(clean), repr(first_word))
          `,hint:`sample.strip().upper() chains two methods. clean.split() gives a list of words; the first one is at index 0.`,solution:k`
            sample = "  Sodium chloride  "

            clean = sample.strip().upper()
            first_word = clean.split()[0]
            print(repr(clean), repr(first_word))
          `,checks:[{label:`clean is "SODIUM CHLORIDE"`,test:`assert clean == "SODIUM CHLORIDE", repr(clean)`},{label:`first_word is "SODIUM"`,test:`assert first_word == "SODIUM", repr(first_word)`}]},{id:`py-fstrings`,language:`python`,title:`f-strings and formatting`,level:`beginner`,minutes:6,text:E("Put an `f` before the opening quote and write values or calculations in braces: Python fills them in. After a colon you say how to show the number.","- `{x:.2f}` two decimals, `{x:8.3f}` at least 8 characters wide\n- `{x:.3e}` scientific notation, `{x:.1%}` a percentage\n- `{n:05d}` an integer padded with zeros, `{name:<10}` text padded to the right",D(k`
              pressure = 101325.0
              ratio = 0.0731
              print(f"p = {pressure:.3e} Pa")
              print(f"yield: {ratio:.1%}")
              print(f"{2 * 21 = }")
            `)),task:"The variable `value` holds 0.025. Print exactly `Concentration: 0.0250 mol/L` using an f-string that shows four decimals.",code:k`
            value = 0.025

            print("Concentration:", value)
          `,hint:`print(f"Concentration: {value:.4f} mol/L")`,solution:k`
            value = 0.025

            print(f"Concentration: {value:.4f} mol/L")
          `,checks:[{label:`prints "Concentration: 0.0250 mol/L"`,test:`assert "Concentration: 0.0250 mol/L" in OUTPUT, OUTPUT`}]}]},{id:`py-flow`,title:`Decisions and loops`,lessons:[{id:`py-conditionals`,language:`python`,title:`if, elif and else`,level:`beginner`,minutes:7,text:E("`if` runs a block only when a condition is true. The block is **indented** by four spaces. `elif` (else if) tries another condition; `else` catches the rest.","Comparisons: `== != < <= > >=`. Combine conditions with `and`, `or`, `not`. Note `==` compares, `=` assigns.",D(k`
              temperature = 37.5
              if temperature > 38:
                  print("fever")
              elif temperature >= 36:
                  print("normal")
              else:
                  print("low")
            `)),task:'Finish `classify(ph)`: it returns the text "acidic" below 7, "basic" above 7 and "neutral" at exactly 7. Use `return`, not `print`.',code:k`
            def classify(ph):
                pass

            print(classify(3.2))
          `,hint:`if ph < 7: return "acidic"  /  elif ph > 7: return "basic"  /  else: return "neutral"`,solution:k`
            def classify(ph):
                if ph < 7:
                    return "acidic"
                elif ph > 7:
                    return "basic"
                else:
                    return "neutral"

            print(classify(3.2))
          `,checks:[{label:`classify(3) is "acidic"`,test:`assert classify(3) == "acidic", repr(classify(3))`},{label:`classify(7) is "neutral"`,test:`assert classify(7) == "neutral", repr(classify(7))`},{label:`classify(11.2) is "basic"`,test:`assert classify(11.2) == "basic", repr(classify(11.2))`}]},{id:`py-loops`,language:`python`,title:`for and while loops`,level:`beginner`,minutes:8,text:E("`for` repeats a block for every item of a sequence; `range(n)` counts 0 … n-1, `range(a, b)` counts a … b-1. `while` repeats as long as a condition is true — make sure something in the block changes it, or it never ends.",D(k`
              total = 0
              for i in range(1, 6):      # 1, 2, 3, 4, 5
                  total += i             # same as total = total + i
              print("sum:", total)

              n = 100
              while n > 10:
                  n = n / 2
              print(n)
            `),"`break` leaves a loop early, `continue` skips to the next round."),task:"Set `total` to the sum of the squares 1², 2², … 10² with a `for` loop. Then use a `while` loop to count in `steps` how many times 100 can be halved before it drops below 1.",code:k`
            total = 0
            # for ... in range(...): add the square of i to total

            value = 100
            steps = 0
            # while value >= 1: halve value, count a step

            print(total, steps)
          `,hint:`for i in range(1, 11): total += i ** 2.   while value >= 1: value = value / 2; steps += 1.`,solution:k`
            total = 0
            for i in range(1, 11):
                total += i ** 2

            value = 100
            steps = 0
            while value >= 1:
                value = value / 2
                steps += 1

            print(total, steps)
          `,checks:[{label:`total is 385`,test:`assert total == 385, f"total is {total}"`},{label:`steps is 7`,test:`assert steps == 7, f"steps is {steps}"`}]},{id:`py-lists`,language:`python`,title:`Lists and loops`,level:`beginner`,minutes:8,text:E("A **list** holds many values in order: `[20.1, 21.4, 19.8]`. Index and slice it like a string; unlike a string you can change it: `values[0] = 5`, `values.append(x)`, `values.remove(x)`, `values.sort()`.","Useful functions: `len(v)`, `sum(v)`, `min(v)`, `max(v)`, `sorted(v)`. `for item in v:` visits every item.",D(k`
              temperatures = [20.1, 21.4, 19.8, 22.0]
              temperatures.append(21.0)
              total = 0
              for t in temperatures:
                  total += t
              print("mean =", round(total / len(temperatures), 2))
              print(max(temperatures), temperatures[-1], temperatures[1:3])
            `)),task:"Add the reading 23.5 to `temperatures`, then set `average` to the mean of the five readings.",code:k`
            temperatures = [20.1, 21.4, 19.8, 22.0]

            average = None
            print(temperatures, average)
          `,hint:`temperatures.append(23.5) first, then average = sum(temperatures) / len(temperatures).`,solution:k`
            temperatures = [20.1, 21.4, 19.8, 22.0]
            temperatures.append(23.5)

            average = sum(temperatures) / len(temperatures)
            print(temperatures, average)
          `,checks:[{label:`temperatures has 5 readings, the last is 23.5`,test:`assert len(temperatures) == 5 and temperatures[-1] == 23.5, temperatures`},{label:`average is the mean (21.36)`,test:`assert abs(average - 21.36) < 1e-9, f"average is {average}"`}]}]},{id:`py-data`,title:`Collections`,lessons:[{id:`py-dicts`,language:`python`,title:`Dictionaries`,level:`beginner`,minutes:8,text:E('A **dictionary** maps keys to values: `{"H": 1.008, "O": 15.999}`. Look up with `d["H"]`, add or change with `d["Na"] = 22.99`. `d.get(key, default)` does not fail on a missing key; `key in d` tests for it.',"Loop with `for key, value in d.items():`; `d.keys()` and `d.values()` give the parts.",D(k`
              masses = {"H": 1.008, "C": 12.011, "O": 15.999}
              water = 2 * masses["H"] + masses["O"]
              print("water:", round(water, 3))
              for symbol, m in masses.items():
                  print(symbol, m)
            `)),task:'Add sodium (`"Na"`, 22.99) to `masses`, then set `nacl` to the molar mass of NaCl (Na plus Cl, with Cl = 35.45) using the dictionary where you can.',code:k`
            masses = {"H": 1.008, "C": 12.011, "O": 15.999, "Cl": 35.45}

            nacl = None
            print(masses, nacl)
          `,hint:`masses["Na"] = 22.99 adds the key. Then nacl = masses["Na"] + masses["Cl"].`,solution:k`
            masses = {"H": 1.008, "C": 12.011, "O": 15.999, "Cl": 35.45}
            masses["Na"] = 22.99

            nacl = masses["Na"] + masses["Cl"]
            print(masses, nacl)
          `,checks:[{label:`masses["Na"] is 22.99`,test:`assert masses.get("Na") == 22.99, masses`},{label:`nacl is 58.44`,test:`assert abs(nacl - 58.44) < 1e-9, f"nacl is {nacl}"`}]},{id:`py-tuples-sets`,language:`python`,title:`Tuples and sets`,level:`beginner`,minutes:7,text:E("A **tuple** is a list that cannot change: `point = (3, 4)`. Use it for a fixed group of values. You can unpack it: `x, y = point`. Functions often return tuples.",'A **set** keeps each value once, without order: `set([1, 2, 2, 3])` is `{1, 2, 3}`. Sets answer "is it in there?" fast and combine like maths: `a | b` union, `a & b` common elements, `a - b` only in a.',D(k`
              x, y = (3, 4)
              print(x + y)
              a = {"Fe", "Cu", "Zn"}
              b = {"Cu", "Ag"}
              print(a & b, a | b, a - b)
            `)),task:"From the list `readings` make `unique` (a set of the distinct values) and, from the two sets, `common` (values in both).",code:k`
            readings = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3]
            a = {1, 2, 3, 4}
            b = {3, 4, 5, 6}

            unique = None
            common = None
            print(unique, common)
          `,hint:`unique = set(readings) and common = a & b`,solution:k`
            readings = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3]
            a = {1, 2, 3, 4}
            b = {3, 4, 5, 6}

            unique = set(readings)
            common = a & b
            print(unique, common)
          `,checks:[{label:`unique has the 7 distinct readings`,test:`assert unique == {1, 2, 3, 4, 5, 6, 9}, unique`},{label:`common is {3, 4}`,test:`assert common == {3, 4}, common`}]},{id:`py-comprehensions`,language:`python`,title:`Comprehensions`,level:`intermediate`,minutes:8,text:E("A **list comprehension** builds a list in one line: `[expression for item in sequence if condition]`. It reads like the loop it replaces.",D(k`
              squares = [n ** 2 for n in range(1, 6)]            # [1, 4, 9, 16, 25]
              odd = [n for n in range(10) if n % 2 == 1]         # [1, 3, 5, 7, 9]
              lengths = {w: len(w) for w in ["ion", "atom"]}     # a dict comprehension
              print(squares, odd, lengths)
            `),`Keep them short: when it needs more than one condition, a normal loop is clearer.`),task:"Make `even_squares`: the squares of the even numbers from 1 to 10. Make `fahrenheit`: each value of `celsius` converted with F = C × 9/5 + 32.",code:k`
            celsius = [0, 25, 37, 100]

            even_squares = []
            fahrenheit = []
            print(even_squares, fahrenheit)
          `,hint:`[n ** 2 for n in range(1, 11) if n % 2 == 0]  and  [c * 9 / 5 + 32 for c in celsius]`,solution:k`
            celsius = [0, 25, 37, 100]

            even_squares = [n ** 2 for n in range(1, 11) if n % 2 == 0]
            fahrenheit = [c * 9 / 5 + 32 for c in celsius]
            print(even_squares, fahrenheit)
          `,checks:[{label:`even_squares is [4, 16, 36, 64, 100]`,test:`assert even_squares == [4, 16, 36, 64, 100], even_squares`},{label:`fahrenheit is [32, 77, 98.6, 212]`,test:`assert len(fahrenheit) == 4 and all(abs(a - b) < 1e-9 for a, b in zip(fahrenheit, [32, 77, 98.6, 212])), fahrenheit`}]}]},{id:`py-functions-ch`,title:`Functions`,lessons:[{id:`py-functions`,language:`python`,title:`Functions`,level:`beginner`,minutes:8,text:E("`def` names a reusable calculation. The names in the brackets are its **parameters**; `return` hands the result back. A function that does not `return` gives `None`.",`The first string in a function is its **docstring**: a note on what it does.`,D(k`
              def ideal_gas_pressure(n, T, V):
                  """p = nRT/V in Pa (T in kelvin, V in m³)."""
                  R = 8.314
                  return n * R * T / V

              print(round(ideal_gas_pressure(1, 298.15, 0.0244)), "Pa")
            `)),task:"Write `to_kelvin(celsius)` that returns the temperature in kelvin (add 273.15).",code:k`
            def ideal_gas_pressure(n, T, V):
                """p = nRT/V in Pa (T in kelvin, V in m³)."""
                R = 8.314
                return n * R * T / V


            # write to_kelvin here


            print(round(ideal_gas_pressure(1, 298.15, 0.0244)), "Pa")
          `,hint:`def to_kelvin(celsius):  then an indented  return celsius + 273.15`,solution:k`
            def ideal_gas_pressure(n, T, V):
                """p = nRT/V in Pa (T in kelvin, V in m³)."""
                R = 8.314
                return n * R * T / V


            def to_kelvin(celsius):
                return celsius + 273.15


            print(round(ideal_gas_pressure(1, to_kelvin(25), 0.0244)), "Pa")
          `,checks:[{label:`to_kelvin(0) is 273.15`,test:`assert abs(to_kelvin(0) - 273.15) < 1e-9`},{label:`to_kelvin(25) is 298.15`,test:`assert abs(to_kelvin(25) - 298.15) < 1e-9`},{label:`ideal_gas_pressure still works`,test:`assert abs(ideal_gas_pressure(1, 298.15, 0.0244) - 101590) < 5`}]},{id:`py-args`,language:`python`,title:`Default and keyword arguments`,level:`intermediate`,minutes:7,text:E("A parameter can have a **default**: `def power(x, n=2)`. Callers may leave it out. Arguments can be given by name (**keyword arguments**), in any order: `power(n=3, x=2)`.",D(k`
              def power(x, n=2):
                  return x ** n

              print(power(5), power(5, 3), power(n=3, x=2))
            `),`Put parameters with defaults after those without. Never use a list as a default value: it would be shared between calls.`),task:"Write `molarity(moles, volume_l=1.0)`: it returns the concentration in mol/L.",code:k`
            def molarity(moles, volume_l):
                pass

            print(molarity(0.5))
          `,hint:`The default goes in the signature: volume_l=1.0. The body is return moles / volume_l.`,solution:k`
            def molarity(moles, volume_l=1.0):
                return moles / volume_l

            print(molarity(0.5), molarity(0.5, volume_l=0.25))
          `,checks:[{label:`molarity(0.5) is 0.5 (one litre by default)`,test:`assert molarity(0.5) == 0.5`},{label:`molarity(0.5, volume_l=0.25) is 2.0`,test:`assert molarity(0.5, volume_l=0.25) == 2.0`},{label:`molarity(moles=1, volume_l=2) is 0.5`,test:`assert molarity(moles=1, volume_l=2) == 0.5`}]},{id:`py-recursion`,language:`python`,title:`Recursion`,level:`intermediate`,minutes:9,text:E(`A function may call itself. A **recursive** function needs a **base case** that answers directly, and a step that moves towards it. Factorial: 0! = 1 and n! = n × (n−1)!.`,D(k`
              def countdown(n):
                  if n == 0:               # base case
                      print("liftoff")
                  else:
                      print(n)
                      countdown(n - 1)     # smaller problem

              countdown(3)
            `),`Python stops a runaway recursion after about a thousand calls with a RecursionError.`),task:"Write `factorial(n)` recursively. `factorial(5)` is 120, `factorial(0)` is 1. Also write `fib(n)`: 0, 1, 1, 2, 3, 5, 8 … (`fib(0)` is 0, `fib(1)` is 1, each next is the sum of the two before).",code:k`
            def factorial(n):
                pass


            def fib(n):
                pass


            print(factorial(5), fib(10))
          `,hint:`factorial: if n == 0 return 1, else return n * factorial(n - 1). fib: if n < 2 return n, else return fib(n - 1) + fib(n - 2).`,solution:k`
            def factorial(n):
                if n == 0:
                    return 1
                return n * factorial(n - 1)


            def fib(n):
                if n < 2:
                    return n
                return fib(n - 1) + fib(n - 2)


            print(factorial(5), fib(10))
          `,checks:[{label:`factorial(0) is 1`,test:`assert factorial(0) == 1`},{label:`factorial(5) is 120`,test:`assert factorial(5) == 120`},{label:`factorial(10) is 3628800`,test:`assert factorial(10) == 3628800`},{label:`fib(0..10) is 0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55`,test:`assert [fib(i) for i in range(11)] == [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55]`}]}]},{id:`py-bigger`,title:`Bigger programs`,lessons:[{id:`py-exceptions`,language:`python`,title:`Errors and exceptions`,level:`intermediate`,minutes:8,text:E("When something goes wrong, Python **raises an exception** (ValueError, ZeroDivisionError, KeyError…) and stops. `try` / `except` catches it so the program can carry on. Catch the specific kind you expect, not everything.",D(k`
              try:
                  x = float("12,5")
              except ValueError:
                  print("not a number")
              else:
                  print("fine", x)
              finally:
                  print("always runs")
            `),'Raise your own with `raise ValueError("negative mass")`. Read a traceback from the bottom: the last line says what happened, the lines above say where.'),task:"Write `safe_float(text, default=0.0)`: it returns `float(text)`, or `default` when the text is not a number (also when it is `None`).",code:k`
            def safe_float(text, default=0.0):
                return float(text)

            print(safe_float("3.5"), safe_float("abc"))
          `,hint:`Wrap return float(text) in try:, and catch (ValueError, TypeError) in the except line: return default.`,solution:k`
            def safe_float(text, default=0.0):
                try:
                    return float(text)
                except (ValueError, TypeError):
                    return default

            print(safe_float("3.5"), safe_float("abc"))
          `,checks:[{label:`safe_float("3.5") is 3.5`,test:`assert safe_float("3.5") == 3.5`},{label:`safe_float("abc") is 0.0`,test:`assert safe_float("abc") == 0.0`},{label:`safe_float("x", default=-1) is -1`,test:`assert safe_float("x", default=-1) == -1`},{label:`safe_float(None, default=7) is 7`,test:`assert safe_float(None, default=7) == 7`}]},{id:`py-classes`,language:`python`,title:`Classes`,level:`intermediate`,minutes:10,text:E("A **class** bundles data and the functions that work on it. `__init__` sets up a new object; `self` is the object itself. Functions inside a class are called **methods**.",D(k`
              class Point:
                  def __init__(self, x, y):
                      self.x = x
                      self.y = y

                  def distance_to_origin(self):
                      return (self.x ** 2 + self.y ** 2) ** 0.5

              p = Point(3, 4)
              print(p.x, p.distance_to_origin())
            `)),task:"Finish the class `Sample`: its `moles()` method returns `mass / molar_mass`, and `__repr__` returns text like `Sample(NaCl, 5.844 g)`.",code:k`
            class Sample:
                def __init__(self, name, mass, molar_mass):
                    self.name = name
                    self.mass = mass
                    self.molar_mass = molar_mass

                def moles(self):
                    pass

                def __repr__(self):
                    return "Sample"


            s = Sample("NaCl", 5.844, 58.44)
            print(s, s.moles())
          `,hint:`Inside a method, reach the data through self: return self.mass / self.molar_mass. For __repr__ use an f-string: f"Sample({self.name}, {self.mass} g)".`,solution:k`
            class Sample:
                def __init__(self, name, mass, molar_mass):
                    self.name = name
                    self.mass = mass
                    self.molar_mass = molar_mass

                def moles(self):
                    return self.mass / self.molar_mass

                def __repr__(self):
                    return f"Sample({self.name}, {self.mass} g)"


            s = Sample("NaCl", 5.844, 58.44)
            print(s, s.moles())
          `,checks:[{label:`moles() of 5.844 g NaCl is 0.1`,test:`assert abs(Sample("NaCl", 5.844, 58.44).moles() - 0.1) < 1e-9`},{label:`moles() uses the sample's own values`,test:`assert abs(Sample("X", 10, 20).moles() - 0.5) < 1e-9`},{label:`repr is "Sample(NaCl, 5.844 g)"`,test:`assert repr(Sample("NaCl", 5.844, 58.44)) == "Sample(NaCl, 5.844 g)", repr(Sample("NaCl", 5.844, 58.44))`}]},{id:`py-modules`,language:`python`,title:`Modules and imports`,level:`beginner`,minutes:7,text:E("A **module** is a file of ready-made tools. `import math` makes `math.sqrt`, `math.pi` and `math.log10` available; `from statistics import mean` brings in one name. The standard library has hundreds: `random`, `statistics`, `datetime`, `json`, `csv`, `pathlib`…",D(k`
              import math
              from statistics import mean, stdev

              print(math.sqrt(2), math.pi)
              data = [4.1, 4.3, 3.9, 4.2]
              print(mean(data), round(stdev(data), 3))
            `),`Any Python file you write can be imported too. For numbers on a large scale, the next course uses **numpy**.`),task:"Compute `area`, the area of a circle of radius 2.5 (π r²), with `math.pi`, and `m` and `s`: the mean and the sample standard deviation (`stdev`) of `data`.",code:k`
            import math
            from statistics import mean, stdev

            data = [9.8, 10.1, 10.0, 9.7, 10.3, 10.2]
            r = 2.5

            area = None
            m = None
            s = None
            print(area, m, s)
          `,hint:`area = math.pi * r ** 2;  m = mean(data);  s = stdev(data)`,solution:k`
            import math
            from statistics import mean, stdev

            data = [9.8, 10.1, 10.0, 9.7, 10.3, 10.2]
            r = 2.5

            area = math.pi * r ** 2
            m = mean(data)
            s = stdev(data)
            print(area, m, s)
          `,checks:[{label:`area is π × 2.5²`,test:`assert abs(area - 19.634954) < 1e-5, area`},{label:`m is the mean of data`,test:`assert abs(m - 10.016667) < 1e-5, m`},{label:`s is the sample standard deviation`,test:`assert abs(s - 0.231661) < 1e-5, s`}]},{id:`py-files`,language:`python`,title:`Reading and writing files`,level:`intermediate`,minutes:10,text:E('Python in KherveOS works in your home folder of the KherveOS drive: files it writes appear in Files, files you put there can be read. `open(path, "w")` writes, `open(path)` reads; `with` closes the file for you.',D(k`
              from pathlib import Path

              path = Path.home() / "kcode-demo.txt"
              with open(path, "w") as f:
                  f.write("first line\n")
                  f.write("second line\n")

              with open(path) as f:
                  for line in f:
                      print(line.strip())
            `),"`Path` objects join with `/`; `path.exists()`, `path.read_text()` and `path.write_text(text)` are shortcuts for the common cases."),task:"Write the numbers 1 to 5 to the file `path`, one per line, then read the file back into the list `numbers` (as integers, not text).",code:k`
            from pathlib import Path

            path = Path.home() / "kcode-numbers.txt"

            # write 1..5, one per line

            numbers = []
            # read them back, as ints

            print(numbers)
          `,hint:`path.write_text("\\n".join(str(i) for i in range(1, 6)))  then  numbers = [int(line) for line in path.read_text().split()]`,solution:k`
            from pathlib import Path

            path = Path.home() / "kcode-numbers.txt"

            with open(path, "w") as f:
                for i in range(1, 6):
                    f.write(f"{i}\n")

            with open(path) as f:
                numbers = [int(line) for line in f]

            print(numbers)
          `,checks:[{label:`the file exists`,test:`assert path.exists(), "no file at " + str(path)`},{label:`the file has 5 lines`,test:`assert len(path.read_text().split()) == 5, path.read_text()`},{label:`numbers is [1, 2, 3, 4, 5]`,test:`assert numbers == [1, 2, 3, 4, 5], numbers`}]}]}]},Ne={id:`python-science`,title:`Python for science`,language:`python`,blurb:`Arrays, fitting, integrals, plots and tables with numpy, scipy, matplotlib and pandas.`,chapters:[{id:`sci-numpy`,title:`NumPy`,lessons:[{id:`py-data`,language:`python`,title:`Arrays with numpy`,level:`intermediate`,minutes:10,needs:[`numpy`],text:E("numpy works on whole **arrays** at once, with no loops. `np.linspace(0, 10, 11)` makes 11 evenly spaced numbers; `np.arange(5)` counts; arithmetic applies to every element.",D(k`
              import numpy as np

              x = np.linspace(0, 10, 11)
              y = 2.0 * x + 1.0
              print(y[:3], y.mean(), y.max())
              print(x[x > 7])            # a mask picks the elements that pass
              slope, intercept = np.polyfit(x, y, 1)
              print(round(slope, 3), round(intercept, 3))
            `),`The first time you import numpy in a window, Python loads it (a few seconds).`),task:"Make `squares` (the square of every element of `x`), `total` (their sum) and `evens` (the elements of `x` that are even — `x % 2 == 0` is the mask).",code:k`
            import numpy as np

            x = np.linspace(0, 10, 11)

            squares = None
            total = None
            evens = None
            print(squares, total, evens)
          `,hint:`squares = x ** 2;  total = squares.sum();  evens = x[x % 2 == 0]`,solution:k`
            import numpy as np

            x = np.linspace(0, 10, 11)

            squares = x ** 2
            total = squares.sum()
            evens = x[x % 2 == 0]
            print(squares, total, evens)
          `,checks:[{label:`squares[3] is 9`,test:`assert squares[3] == 9, squares`},{label:`total is 385`,test:`assert total == 385, total`},{label:`evens is [0, 2, 4, 6, 8, 10]`,test:`assert evens.tolist() == [0, 2, 4, 6, 8, 10], evens`}]},{id:`np-broadcasting`,language:`python`,title:`Shapes, axes and broadcasting`,level:`intermediate`,minutes:10,needs:[`numpy`],text:E("A 2-D array has rows (axis 0) and columns (axis 1). `a.mean(axis=0)` averages down the rows and gives one value per column. `a.shape` tells the size.","**Broadcasting** stretches smaller arrays to fit larger ones: a row of 3 numbers added to a 4×3 table is added to every row. `v[:, None]` turns a flat array into a column, so `col * row` makes a table.",D(k`
              import numpy as np

              a = np.arange(6).reshape(2, 3)    # [[0 1 2], [3 4 5]]
              print(a.shape, a.mean(axis=0), a.sum(axis=1))
              print(a - a.mean(axis=0))          # subtract each column's mean
              print(np.arange(1, 4)[:, None] * np.arange(1, 4))
            `)),task:"Make `centered`: `a` minus the mean of each of its columns. Make `table`: the 5×5 multiplication table (`table[2, 3]` is 3 × 4 = 12).",code:k`
            import numpy as np

            a = np.array([[1.0, 2.0, 3.0],
                          [4.0, 6.0, 8.0],
                          [7.0, 10.0, 13.0]])

            centered = None
            table = None
            print(centered)
            print(table)
          `,hint:`centered = a - a.mean(axis=0).  table = np.arange(1, 6)[:, None] * np.arange(1, 6)`,solution:k`
            import numpy as np

            a = np.array([[1.0, 2.0, 3.0],
                          [4.0, 6.0, 8.0],
                          [7.0, 10.0, 13.0]])

            centered = a - a.mean(axis=0)
            table = np.arange(1, 6)[:, None] * np.arange(1, 6)
            print(centered)
            print(table)
          `,checks:[{label:`centered has the shape of a`,test:`assert centered.shape == (3, 3), getattr(centered, "shape", None)`},{label:`every column of centered has mean 0`,test:`assert np.allclose(centered.mean(axis=0), 0)`},{label:`table is 5 × 5`,test:`assert table.shape == (5, 5), table.shape`},{label:`table[2, 3] is 12`,test:`assert table[2, 3] == 12, table[2, 3]`}]},{id:`np-linalg`,language:`python`,title:`Linear algebra`,level:`advanced`,minutes:10,needs:[`numpy`],text:E("`A @ B` multiplies matrices. `np.linalg.solve(A, b)` solves the system A·x = b (better than inverting A). `np.linalg.det(A)` is the determinant, `np.linalg.eigvals(A)` the eigenvalues.",D(k`
              import numpy as np

              A = np.array([[3.0, 1.0], [1.0, 2.0]])
              b = np.array([9.0, 8.0])
              x = np.linalg.solve(A, b)         # [2, 3]
              print(x, A @ x)
              print(np.linalg.det(A), np.linalg.eigvals(A))
            `),`Balancing chemical equations, circuit loops and least squares all end up as A·x = b.`),task:"Solve the three equations 2x + y − z = 8, −3x − y + 2z = −11, −2x + y + 2z = −3 for `x` (an array of three numbers) and put the determinant of `A` in `det`.",code:k`
            import numpy as np

            A = np.array([[ 2.0,  1.0, -1.0],
                          [-3.0, -1.0,  2.0],
                          [-2.0,  1.0,  2.0]])
            b = np.array([8.0, -11.0, -3.0])

            x = None
            det = None
            print(x, det)
          `,hint:`x = np.linalg.solve(A, b) and det = np.linalg.det(A)`,solution:k`
            import numpy as np

            A = np.array([[ 2.0,  1.0, -1.0],
                          [-3.0, -1.0,  2.0],
                          [-2.0,  1.0,  2.0]])
            b = np.array([8.0, -11.0, -3.0])

            x = np.linalg.solve(A, b)
            det = np.linalg.det(A)
            print(x, det)
          `,checks:[{label:`A @ x equals b`,test:`assert np.allclose(A @ x, b), A @ x`},{label:`x is [2, 3, -1]`,test:`assert np.allclose(x, [2, 3, -1]), x`},{label:`det is -1`,test:`assert abs(det + 1) < 1e-9, det`}]},{id:`np-statistics`,language:`python`,title:`Statistics of measurements`,level:`intermediate`,minutes:10,needs:[`numpy`],text:E("Repeat a measurement and you get a spread. The **mean** is the best value; the **sample standard deviation** (`ddof=1`) describes the spread; the **standard error** `s/√n` says how well you know the mean.",D(k`
              import numpy as np

              data = np.array([9.8, 10.1, 10.0, 9.7, 10.3, 10.2])
              mean = data.mean()
              s = data.std(ddof=1)               # ddof=1: divide by n-1
              print(f"{mean:.3f} ± {s / np.sqrt(len(data)):.3f}")
              print(np.median(data), np.percentile(data, [25, 75]))
            `),'Random numbers: `rng = np.random.default_rng(42)` then `rng.normal(10, 0.2, size=100)`. The seed makes the "random" numbers the same on every run.'),task:"Compute `mean`, the sample standard deviation `sd` (with `ddof=1`) and the standard error `sem` of `data`.",code:k`
            import numpy as np

            data = np.array([9.8, 10.1, 10.0, 9.7, 10.3, 10.2])

            mean = None
            sd = None
            sem = None
            print(mean, sd, sem)
          `,hint:`data.mean(); data.std(ddof=1); sem = sd / np.sqrt(len(data))`,solution:k`
            import numpy as np

            data = np.array([9.8, 10.1, 10.0, 9.7, 10.3, 10.2])

            mean = data.mean()
            sd = data.std(ddof=1)
            sem = sd / np.sqrt(len(data))
            print(mean, sd, sem)
          `,checks:[{label:`mean is 10.0167`,test:`assert abs(mean - 10.016667) < 1e-5, mean`},{label:`sd uses ddof=1 (0.2317)`,test:`assert abs(sd - 0.231661) < 1e-5, sd`},{label:`sem is sd / √n (0.0946)`,test:`assert abs(sem - 0.094575) < 1e-5, sem`}]}]},{id:`sci-scipy`,title:`SciPy`,lessons:[{id:`sp-minimize`,language:`python`,title:`Optimisation`,level:`advanced`,minutes:10,needs:[`numpy`,`scipy`],text:E("`scipy.optimize.minimize(f, x0)` looks for the input that makes `f` smallest, starting from the guess `x0`. `f` takes one array and returns one number. The answer is in `result.x`, the lowest value in `result.fun`.",D(k`
              import numpy as np
              from scipy.optimize import minimize

              def f(p):
                  x, y = p
                  return (x - 3) ** 2 + (y + 1) ** 2 + 5

              result = minimize(f, [0, 0])
              print(result.x.round(3), round(result.fun, 3))
            `),`To maximise something, minimise its negative.`),task:"Find the minimum of `energy(p)`, a function of two values. Put the result of `minimize` in `result`, starting from `[0, 0]`.",code:k`
            import numpy as np
            from scipy.optimize import minimize

            def energy(p):
                x, y = p
                return (x - 1) ** 2 + (y + 2) ** 2 + 0.5 * x * y + 3

            result = None
            print(result)
          `,hint:`result = minimize(energy, [0, 0])  — then result.x holds the best point.`,solution:k`
            import numpy as np
            from scipy.optimize import minimize

            def energy(p):
                x, y = p
                return (x - 1) ** 2 + (y + 2) ** 2 + 0.5 * x * y + 3

            result = minimize(energy, [0, 0])
            print(result.x, result.fun)
          `,checks:[{label:`the optimiser succeeded`,test:`assert result.success`},{label:`the energy there is lower than at the start`,test:`assert result.fun < energy([0, 0]) - 1`},{label:`the minimum is found (x ≈ 1.6, y ≈ −2.4)`,test:`assert np.allclose(result.x, [1.6, -2.4], atol=1e-3), result.x`}]},{id:`sp-curve-fit`,language:`python`,title:`Fitting a curve to data`,level:`advanced`,minutes:12,needs:[`numpy`,`scipy`],text:E("`curve_fit(model, x, y, p0)` adjusts the parameters of your own function `model(x, a, b, …)` until it matches the data. It returns the best parameters `popt` and their covariance `pcov`; the square roots of the diagonal of `pcov` are the parameter uncertainties.",D(k`
              import numpy as np
              from scipy.optimize import curve_fit

              def line(x, m, c):
                  return m * x + c

              x = np.array([0, 1, 2, 3, 4])
              y = np.array([1.1, 2.9, 5.2, 7.0, 8.9])
              popt, pcov = curve_fit(line, x, y)
              print(popt, np.sqrt(np.diag(pcov)))
            `),"Good starting values `p0` matter for curved models: take them from the picture of the data."),task:"The data decays like a·e^(−k·t). Write `model(t, a, k)`, fit it with `curve_fit` (start from `p0=[5, 1]`) and unpack the result into `a` and `k`.",code:k`
            import numpy as np
            from scipy.optimize import curve_fit

            t = np.linspace(0, 5, 11)
            y = np.array([10.15, 7.59, 6.17, 4.67, 3.8, 2.77, 2.28, 1.82, 1.31, 1.07, 0.79])

            def model(t, a, k):
                pass

            a, k = None, None
            print(a, k)
          `,hint:`model returns a * np.exp(-k * t).  popt, pcov = curve_fit(model, t, y, p0=[5, 1]); a, k = popt`,solution:k`
            import numpy as np
            from scipy.optimize import curve_fit

            t = np.linspace(0, 5, 11)
            y = np.array([10.15, 7.59, 6.17, 4.67, 3.8, 2.77, 2.28, 1.82, 1.31, 1.07, 0.79])

            def model(t, a, k):
                return a * np.exp(-k * t)

            popt, pcov = curve_fit(model, t, y, p0=[5, 1])
            a, k = popt
            print(f"a = {a:.2f}, k = {k:.3f}")
          `,checks:[{label:`model(0, 3, 1) is 3`,test:`assert abs(model(0, 3, 1) - 3) < 1e-9`},{label:`a is about 10`,test:`assert abs(a - 10.04) < 0.05, a`},{label:`k is about 0.5`,test:`assert abs(k - 0.501) < 0.01, k`}]},{id:`sp-integrate`,language:`python`,title:`Integrals`,level:`advanced`,minutes:9,needs:[`numpy`,`scipy`],text:E("For a **function**, `scipy.integrate.quad(f, a, b)` returns the area under it and an error estimate. For **data points**, `trapezoid(y, x)` adds up trapezoids.",D(k`
              import numpy as np
              from scipy.integrate import quad, trapezoid

              area, err = quad(np.sin, 0, np.pi)         # 2
              x = np.linspace(0, np.pi, 50)
              print(area, trapezoid(np.sin(x), x))
            `)),task:"Compute `exact`, the integral of x² from 0 to 3 with `quad` (just the value), and `approx`, the trapezoid rule on the 7 points `x`, `x**2`.",code:k`
            import numpy as np
            from scipy.integrate import quad, trapezoid

            x = np.linspace(0, 3, 7)

            exact = None
            approx = None
            print(exact, approx)
          `,hint:`quad returns (value, error): exact, _ = quad(lambda t: t ** 2, 0, 3).   approx = trapezoid(x ** 2, x)`,solution:k`
            import numpy as np
            from scipy.integrate import quad, trapezoid

            x = np.linspace(0, 3, 7)

            exact, _ = quad(lambda t: t ** 2, 0, 3)
            approx = trapezoid(x ** 2, x)
            print(exact, approx)
          `,checks:[{label:`exact is 9`,test:`assert abs(exact - 9) < 1e-9, exact`},{label:`approx is the trapezoid sum (9.125)`,test:`assert abs(approx - 9.125) < 1e-9, approx`}]}]},{id:`sci-plots`,title:`Plots and tables`,lessons:[{id:`mpl-line-plot`,language:`python`,title:`Plotting with matplotlib`,level:`intermediate`,minutes:10,needs:[`numpy`,`matplotlib`],text:E('matplotlib draws charts. Make a figure and its axes with `fig, ax = plt.subplots()`, then draw on `ax` with `ax.plot(x, y, label="…")`, and add `ax.set_xlabel`, `ax.set_ylabel`, `ax.legend()`. In kCode the figure appears in the output below the editor.',D(k`
              import numpy as np
              import matplotlib.pyplot as plt

              x = np.linspace(0, 2 * np.pi, 100)
              fig, ax = plt.subplots()
              ax.plot(x, np.sin(x), label="sin")
              ax.set_xlabel("angle (rad)")
              ax.legend()
            `),`A good chart has labelled axes with units, and a legend only when there is more than one line.`),task:`Draw sin(x) **and** cos(x) on the same axes, each with a label, add the axis labels and a legend.`,code:k`
            import numpy as np
            import matplotlib.pyplot as plt

            x = np.linspace(0, 2 * np.pi, 100)
            fig, ax = plt.subplots()
            ax.plot(x, np.sin(x), label="sin")
            # add cos, the labels and the legend
          `,hint:`ax.plot(x, np.cos(x), label="cos"); ax.set_xlabel("angle (rad)"); ax.set_ylabel("value"); ax.legend()`,solution:k`
            import numpy as np
            import matplotlib.pyplot as plt

            x = np.linspace(0, 2 * np.pi, 100)
            fig, ax = plt.subplots()
            ax.plot(x, np.sin(x), label="sin")
            ax.plot(x, np.cos(x), label="cos")
            ax.set_xlabel("angle (rad)")
            ax.set_ylabel("value")
            ax.legend()
          `,checks:[{label:`two lines are drawn`,test:`assert len(ax.lines) == 2, len(ax.lines)`},{label:`the x axis has a label`,test:`assert ax.get_xlabel().strip() != ""`},{label:`the y axis has a label`,test:`assert ax.get_ylabel().strip() != ""`},{label:`there is a legend`,test:`assert ax.get_legend() is not None`}]},{id:`mpl-histogram`,language:`python`,title:`Histograms and error bars`,level:`advanced`,minutes:11,needs:[`numpy`,`matplotlib`],text:E('A **histogram** counts how many values fall in each bin: `counts, edges = np.histogram(data, bins=10)` or `ax.hist(data, bins=10)`. `ax.errorbar(x, y, yerr=sigma, fmt="o")` draws points with error bars.',D(k`
              import numpy as np
              import matplotlib.pyplot as plt

              rng = np.random.default_rng(1)
              data = rng.normal(10, 0.5, 200)
              fig, (left, right) = plt.subplots(1, 2, figsize=(8, 3))
              left.hist(data, bins=15)
              right.errorbar([1, 2, 3], [2.0, 2.8, 4.1], yerr=[0.2, 0.3, 0.2], fmt="o")
            `)),task:"With the random `data` make `counts, edges` with 10 bins (the counts add up to all 200 values). Then on `ax`, draw the measurements `x`, `y` with error bars `err` using `ax.errorbar`.",code:k`
            import numpy as np
            import matplotlib.pyplot as plt

            rng = np.random.default_rng(7)
            data = rng.normal(5.0, 1.0, 200)
            x = np.array([1, 2, 3, 4])
            y = np.array([2.1, 3.9, 6.2, 7.8])
            err = np.array([0.3, 0.3, 0.4, 0.3])

            counts, edges = None, None
            fig, ax = plt.subplots()
            # ax.errorbar(...)
          `,hint:`counts, edges = np.histogram(data, bins=10).   ax.errorbar(x, y, yerr=err, fmt="o")`,solution:k`
            import numpy as np
            import matplotlib.pyplot as plt

            rng = np.random.default_rng(7)
            data = rng.normal(5.0, 1.0, 200)
            x = np.array([1, 2, 3, 4])
            y = np.array([2.1, 3.9, 6.2, 7.8])
            err = np.array([0.3, 0.3, 0.4, 0.3])

            counts, edges = np.histogram(data, bins=10)
            fig, ax = plt.subplots()
            ax.errorbar(x, y, yerr=err, fmt="o")
          `,checks:[{label:`counts has 10 bins`,test:`assert len(counts) == 10, counts`},{label:`the counts add up to 200`,test:`assert counts.sum() == 200, counts.sum()`},{label:`the figure has an error-bar plot`,test:`assert len(ax.containers) >= 1, "nothing drawn with ax.errorbar"`}]},{id:`pd-dataframe`,language:`python`,title:`pandas: tables`,level:`intermediate`,minutes:10,needs:[`pandas`],text:E('A pandas **DataFrame** is a table with named columns. Pick a column with `df["mass"]`, filter rows with a condition `df[df["mass"] > 5]`, and add a column by assigning to a new name — the calculation applies to the whole column.',D(k`
              import pandas as pd

              df = pd.DataFrame({"sample": ["A", "B", "C"], "mass": [2.0, 5.5, 8.1]})
              df["double"] = df["mass"] * 2
              print(df)
              print(df[df["mass"] > 5]["sample"].tolist())
              print(df["mass"].mean())
            `),"`df.describe()` gives count, mean, spread and quartiles of every numeric column."),task:"Add a column `moles` to `df` (mass divided by molar mass), and put the rows heavier than 5 g in `heavy`.",code:k`
            import pandas as pd

            df = pd.DataFrame({
                "sample": ["A", "B", "C", "D"],
                "mass": [2.0, 5.5, 8.1, 3.2],
                "molar_mass": [20.0, 55.0, 81.0, 32.0],
            })

            heavy = None
            print(df)
          `,hint:`df["moles"] = df["mass"] / df["molar_mass"].   heavy = df[df["mass"] > 5]`,solution:k`
            import pandas as pd

            df = pd.DataFrame({
                "sample": ["A", "B", "C", "D"],
                "mass": [2.0, 5.5, 8.1, 3.2],
                "molar_mass": [20.0, 55.0, 81.0, 32.0],
            })

            df["moles"] = df["mass"] / df["molar_mass"]
            heavy = df[df["mass"] > 5]
            print(df)
            print(heavy)
          `,checks:[{label:`df has a "moles" column`,test:`assert "moles" in df.columns, list(df.columns)`},{label:`moles is mass / molar_mass`,test:`assert (df["moles"] - df["mass"] / df["molar_mass"]).abs().max() < 1e-12`},{label:`heavy holds samples B and C`,test:`assert heavy["sample"].tolist() == ["B", "C"], heavy`}]},{id:`pd-groupby`,language:`python`,title:`pandas: grouping and summaries`,level:`advanced`,minutes:11,needs:[`pandas`],text:E('`df.groupby("sample")["value"].mean()` splits the rows by sample and averages each group. Other summaries: `.std()`, `.count()`, `.max()`; `.agg(["mean", "std"])` gives several at once. `df.sort_values("value")` orders rows.',D(k`
              import io
              import pandas as pd

              text = "sample,value\nA,1.0\nA,3.0\nB,4.0\nB,6.0"
              df = pd.read_csv(io.StringIO(text))     # read_csv also takes a file path
              print(df.groupby("sample")["value"].mean())
            `)),task:"Read the table `text`; make `means` (the mean `value` of each `sample`) and `best`, the name of the sample with the highest mean.",code:k`
            import io
            import pandas as pd

            text = "sample,value\nA,1.0\nA,3.0\nB,4.0\nB,6.0\nC,2.5\nC,2.7"

            df = pd.read_csv(io.StringIO(text))
            means = None
            best = None
            print(means, best)
          `,hint:`means = df.groupby("sample")["value"].mean().   best = means.idxmax()`,solution:k`
            import io
            import pandas as pd

            text = "sample,value\nA,1.0\nA,3.0\nB,4.0\nB,6.0\nC,2.5\nC,2.7"

            df = pd.read_csv(io.StringIO(text))
            means = df.groupby("sample")["value"].mean()
            best = means.idxmax()
            print(means, best)
          `,checks:[{label:`means["A"] is 2.0`,test:`assert abs(means["A"] - 2.0) < 1e-9, means`},{label:`means["C"] is 2.6`,test:`assert abs(means["C"] - 2.6) < 1e-9, means`},{label:`best is "B"`,test:`assert best == "B", best`}]}]}]},j="`",M="${",Pe=[A,Ne,{id:`javascript-basics`,title:`JavaScript basics`,language:`javascript`,blurb:`The language of the web: values, functions, arrays, objects, JSON, promises and classes.`,chapters:[{id:`js-first`,title:`First steps`,lessons:[{id:`js-hello`,language:`javascript`,title:`Hello, JavaScript`,level:`beginner`,minutes:4,text:E("JavaScript runs in every browser. `console.log()` shows a value in the output; several values are separated by spaces. Statements end with `;` (optional but common), comments start with `//`.",`kCode runs your code in a separate worker: it cannot touch this window, and it is stopped after 5 seconds if it never ends. The value of the **last expression** is shown too, like in a calculator.`,O(k`
              console.log("Hello, lab!");
              console.log(2 + 3 * 4);   // 14
              2 ** 10                    // the last value is shown: 1024
            `)),task:`Log the number of seconds in one day (24 hours of 60 minutes of 60 seconds); let JavaScript multiply.`,code:k`
            console.log("Hello, lab!");
            console.log(2 + 3 * 4);

            // Your turn: log the seconds in a day
          `,hint:`console.log(24 * 60 * 60);`,solution:k`
            console.log("Hello, lab!");
            console.log(2 + 3 * 4);

            console.log(24 * 60 * 60);
          `,checks:[{label:`logs 86400`,test:`__logs.some((line) => line.includes("86400"))`}]},{id:`js-types`,language:`javascript`,title:`Values and types`,level:`beginner`,minutes:7,text:E('The basic kinds of value: **number** (`3`, `2.5`), **string** (`"text"`), **boolean** (`true`, `false`), `null` (nothing, on purpose) and `undefined` (not set). `typeof x` tells which.','Take care with `+`: with a string on either side it **joins text** instead of adding. `Number("42")` converts text to a number; `String(42)` and `x.toFixed(2)` go the other way. Compare with `===` (strict), not `==`.',O(k`
              console.log(typeof 42, typeof "42", typeof true, typeof undefined);
              console.log("4" + 2, 4 + 2, Number("4") + 2);
              console.log(0.1 + 0.2 === 0.3, Math.abs(0.1 + 0.2 - 0.3) < 1e-9);
            `)),task:'`total` should be 50 (a number), but the text "42" makes `+` join strings. Convert the text first.',code:k`
            const text = "42";
            let total = text + 8;
            console.log(total, typeof total);
          `,hint:`Number(text) + 8`,solution:k`
            const text = "42";
            let total = Number(text) + 8;
            console.log(total, typeof total);
          `,checks:[{label:`total is a number`,test:`typeof total === "number" || "total is a " + typeof total`},{label:`total is 50`,test:`total === 50 || "total is " + JSON.stringify(total)`}]},{id:`js-strings`,language:`javascript`,title:`Strings and template literals`,level:`beginner`,minutes:7,text:E('Strings have methods: `.toUpperCase()`, `.trim()`, `.split(",")`, `.includes("x")`, `.slice(0, 3)`, `.replace("a", "b")`, `.padStart(5, "0")`. A **template literal**, between backticks, puts values into text: write the value as dollar sign, braces around it.',O(k`
              const name = "NaCl";
              const mass = 5.8443;
              console.log(${j}${M}name} weighs ${M}mass.toFixed(2)} g${j});
              console.log("a,b,c".split(","), "  hi  ".trim().toUpperCase());
            `)),task:"Log exactly `Concentration: 0.0250 mol/L` using a template literal and `toFixed(4)` on `value`.",code:k`
            const value = 0.025;

            console.log("Concentration:", value);
          `,hint:"console.log(`Concentration: ${value.toFixed(4)} mol/L`);",solution:k`
            const value = 0.025;

            console.log(${j}Concentration: ${M}value.toFixed(4)} mol/L${j});
          `,checks:[{label:`logs "Concentration: 0.0250 mol/L"`,test:`__logs.includes("Concentration: 0.0250 mol/L") || "logged " + JSON.stringify(__logs)`}]},{id:`js-variables`,language:`javascript`,title:`Variables and arrays`,level:`beginner`,minutes:8,text:E("`const` names a value that will not be reassigned; `let` names one that will. Prefer `const`. An **array** is a list: `[1.2, 3.4]`, indexed from 0, with `.length`, `.push(x)` (add at the end), `.pop()`, `.includes(x)` and `.slice(a, b)`.",O(k`
              const masses = [1.2, 3.4, 5.6];
              masses.push(7.8);
              let total = 0;
              for (const m of masses) {
                total += m;
              }
              console.log(masses.length, total.toFixed(2), masses[0]);
            `),"A `const` array can still change its contents: only the name is fixed."),task:"Add 7.8 to `masses`, then set `total` to the sum and `mean` to the average of the four values.",code:k`
            const masses = [1.2, 3.4, 5.6];
            let total = 0;
            let mean = 0;

            console.log(masses, total, mean);
          `,hint:`masses.push(7.8); then loop with for (const m of masses) { total += m; }  and  mean = total / masses.length;`,solution:k`
            const masses = [1.2, 3.4, 5.6];
            masses.push(7.8);
            let total = 0;
            for (const m of masses) {
              total += m;
            }
            let mean = total / masses.length;

            console.log(masses, total, mean);
          `,checks:[{label:`masses has 4 values, the last is 7.8`,test:`masses.length === 4 && masses[3] === 7.8`},{label:`total is 18`,test:`Math.abs(total - 18) < 1e-9 || "total is " + total`},{label:`mean is 4.5`,test:`Math.abs(mean - 4.5) < 1e-9 || "mean is " + mean`}]},{id:`js-control`,language:`javascript`,title:`Conditions and loops`,level:`beginner`,minutes:8,text:E("`if (condition) { … } else if (…) { … } else { … }` chooses. `for (let i = 0; i < 5; i++)` repeats with a counter; `for (const x of list)` visits every item; `while (condition)` repeats until the condition is false. `&&` is and, `||` is or, `!` is not, `%` the remainder.",O(k`
              for (let i = 1; i <= 5; i++) {
                if (i % 2 === 0) console.log(i, "even");
                else console.log(i, "odd");
              }
            `)),task:'Write `describe(n)`: it returns "FizzBuzz" if n divides by 3 and by 5, "Fizz" if only by 3, "Buzz" if only by 5, otherwise the number as text.',code:k`
            function describe(n) {
              return "";
            }

            for (let i = 1; i <= 15; i++) console.log(describe(i));
          `,hint:`Test the both-case first: if (n % 15 === 0) return "FizzBuzz"; then n % 3, then n % 5; finally return String(n).`,solution:k`
            function describe(n) {
              if (n % 15 === 0) return "FizzBuzz";
              if (n % 3 === 0) return "Fizz";
              if (n % 5 === 0) return "Buzz";
              return String(n);
            }

            for (let i = 1; i <= 15; i++) console.log(describe(i));
          `,checks:[{label:`describe(15) is "FizzBuzz"`,test:`describe(15) === "FizzBuzz" || "got " + JSON.stringify(describe(15))`},{label:`describe(9) is "Fizz"`,test:`describe(9) === "Fizz" || "got " + JSON.stringify(describe(9))`},{label:`describe(10) is "Buzz"`,test:`describe(10) === "Buzz" || "got " + JSON.stringify(describe(10))`},{label:`describe(7) is "7"`,test:`describe(7) === "7" || "got " + JSON.stringify(describe(7))`}]}]},{id:`js-functions-ch`,title:`Functions and arrays`,lessons:[{id:`js-functions`,language:`javascript`,title:`Functions`,level:`beginner`,minutes:7,text:E("A function takes inputs (**parameters**) and gives back a result with `return`. Two spellings: `function area(r) { return Math.PI * r ** 2; }` and the **arrow function** `const area = (r) => Math.PI * r ** 2;`. Parameters can have defaults: `(r, digits = 2) => …`.",O(k`
              const area = (r) => Math.PI * r ** 2;
              for (const r of [1, 2, 3]) {
                console.log("r =", r, "area =", area(r).toFixed(3));
              }
            `)),task:"Write the arrow function `volume(r)` for the volume of a sphere, 4/3 π r³.",code:k`
            const volume = (r) => 0;

            console.log(volume(1));
          `,hint:`const volume = (r) => (4 / 3) * Math.PI * r ** 3;`,solution:k`
            const volume = (r) => (4 / 3) * Math.PI * r ** 3;

            console.log(volume(1));
          `,checks:[{label:`volume(1) is 4.18879`,test:`Math.abs(volume(1) - 4.18879) < 1e-4 || "got " + volume(1)`},{label:`volume(2) is 33.51032`,test:`Math.abs(volume(2) - 33.51032) < 1e-4 || "got " + volume(2)`}]},{id:`js-closures`,language:`javascript`,title:`Closures and scope`,level:`intermediate`,minutes:9,text:E("A function remembers the variables around where it was created — a **closure**. Variables of `let` and `const` live inside the nearest `{ }` block. A function returned from another function keeps its own private copy of the outer variables.",O(k`
              function makeCounter() {
                let count = 0;
                return () => ++count;
              }
              const a = makeCounter();
              const b = makeCounter();
              console.log(a(), a(), a(), b());   // 1 2 3 1
            `)),task:"Write `makeAccumulator(start)`: it returns a function that adds its argument to a running total (beginning at `start`) and returns the new total. Two accumulators must not share their totals.",code:k`
            function makeAccumulator(start) {
              return (amount) => 0;
            }

            const acc = makeAccumulator(10);
            console.log(acc(5), acc(7));
          `,hint:`Keep let total = start; inside makeAccumulator, and let the returned function do total += amount; return total;`,solution:k`
            function makeAccumulator(start) {
              let total = start;
              return (amount) => {
                total += amount;
                return total;
              };
            }

            const acc = makeAccumulator(10);
            console.log(acc(5), acc(7));
          `,checks:[{label:`adds to the start value (10 + 5 + 7 = 22)`,test:`(() => { const a = makeAccumulator(10); a(5); const t = a(7); return t === 22 || "got " + t; })()`},{label:`two accumulators are independent`,test:`(() => { const a = makeAccumulator(0); const b = makeAccumulator(100); a(1); b(1); return a(0) === 1 && b(0) === 101; })()`}]},{id:`js-array-methods`,language:`javascript`,title:`map, filter and reduce`,level:`intermediate`,minutes:10,text:E("Arrays have methods that take a function: `map` makes a new array by transforming each item, `filter` keeps items that pass a test, `reduce` folds the whole array into one value, `find`, `some`, `every` and `sort((a, b) => a - b)` do what they say.",O(k`
              const values = [3, 1, 4, 1, 5];
              console.log(values.map((v) => v * 2));
              console.log(values.filter((v) => v > 2));
              console.log(values.reduce((sum, v) => sum + v, 0));
            `),"`map` and `filter` return a new array; the original is untouched."),task:"From the Celsius `readings` make `fahrenheit` (each × 9/5 + 32) with `map`, `hot` (only readings above 25) with `filter`, and `sum` with `reduce`.",code:k`
            const readings = [18.5, 22, 26.5, 30, 24];

            let fahrenheit = [];
            let hot = [];
            let sum = 0;
            console.log(fahrenheit, hot, sum);
          `,hint:`readings.map((c) => c * 9 / 5 + 32);  readings.filter((c) => c > 25);  readings.reduce((s, c) => s + c, 0)`,solution:k`
            const readings = [18.5, 22, 26.5, 30, 24];

            const fahrenheit = readings.map((c) => (c * 9) / 5 + 32);
            const hot = readings.filter((c) => c > 25);
            const sum = readings.reduce((s, c) => s + c, 0);
            console.log(fahrenheit, hot, sum);
          `,checks:[{label:`fahrenheit has the 5 converted values (65.3 first)`,test:`fahrenheit.length === 5 && Math.abs(fahrenheit[0] - 65.3) < 1e-9 || "got " + JSON.stringify(fahrenheit)`},{label:`hot is [26.5, 30]`,test:`JSON.stringify(hot) === "[26.5,30]" || "got " + JSON.stringify(hot)`},{label:`sum is 121`,test:`Math.abs(sum - 121) < 1e-9 || "got " + sum`}]}]},{id:`js-data`,title:`Objects and data`,lessons:[{id:`js-objects`,language:`javascript`,title:`Objects`,level:`beginner`,minutes:8,text:E('An **object** groups named values: `{ name: "NaCl", mass: 5.844 }`. Read with `sample.mass` or `sample["mass"]`, add or change with `sample.molarMass = 58.44`. `Object.keys(o)`, `Object.values(o)` and `Object.entries(o)` list the parts; `"key" in o` tests for one.',O(k`
              const sample = { name: "NaCl", mass: 5.844 };
              sample.molarMass = 58.44;
              for (const [key, value] of Object.entries(sample)) {
                console.log(key, "->", value);
              }
            `)),task:"Give `sample` a `molarMass` of 58.44, and write `moles(s)` that returns the mass divided by the molar mass of the object it gets.",code:k`
            const sample = { name: "NaCl", mass: 5.844 };

            function moles(s) {
              return 0;
            }

            console.log(sample, moles(sample));
          `,hint:`sample.molarMass = 58.44;  and in moles:  return s.mass / s.molarMass;`,solution:k`
            const sample = { name: "NaCl", mass: 5.844 };
            sample.molarMass = 58.44;

            function moles(s) {
              return s.mass / s.molarMass;
            }

            console.log(sample, moles(sample));
          `,checks:[{label:`sample.molarMass is 58.44`,test:`sample.molarMass === 58.44 || "got " + sample.molarMass`},{label:`moles(sample) is 0.1`,test:`Math.abs(moles(sample) - 0.1) < 1e-9 || "got " + moles(sample)`},{label:`moles works for any object`,test:`moles({ mass: 10, molarMass: 20 }) === 0.5`}]},{id:`js-destructuring`,language:`javascript`,title:`Destructuring and spread`,level:`intermediate`,minutes:8,text:E("**Destructuring** unpacks arrays and objects into variables: `const [a, b] = list`, `const { name, mass } = sample`, and renaming `const { mass: m } = sample`. The **rest** `...` collects the remainder; the **spread** `...` copies items into a new array or object.",O(k`
              const [first, ...others] = [10, 20, 30];
              const { name, mass: m } = { name: "Fe", mass: 55.85 };
              const merged = { ...{ a: 1, b: 2 }, b: 3 };
              console.log(first, others, name, m, merged);
            `)),task:"Using destructuring and spread: `head` and `tail` from `values` (first value, the others), `symbol` from the `element` object, and `settings`: `defaults` overridden by `options`.",code:k`
            const values = [4, 8, 15, 16];
            const element = { symbol: "Fe", mass: 55.85 };
            const defaults = { unit: "g", digits: 2 };
            const options = { digits: 4 };

            let head, tail, symbol, settings;
            console.log(head, tail, symbol, settings);
          `,hint:`const [head, ...tail] = values;  const { symbol } = element;  const settings = { ...defaults, ...options };  (delete the let line first)`,solution:k`
            const values = [4, 8, 15, 16];
            const element = { symbol: "Fe", mass: 55.85 };
            const defaults = { unit: "g", digits: 2 };
            const options = { digits: 4 };

            const [head, ...tail] = values;
            const { symbol } = element;
            const settings = { ...defaults, ...options };
            console.log(head, tail, symbol, settings);
          `,checks:[{label:`head is 4`,test:`head === 4 || "got " + head`},{label:`tail is [8, 15, 16]`,test:`JSON.stringify(tail) === "[8,15,16]" || "got " + JSON.stringify(tail)`},{label:`symbol is "Fe"`,test:`symbol === "Fe" || "got " + symbol`},{label:`settings is { unit: "g", digits: 4 }`,test:`JSON.stringify(settings) === '{"unit":"g","digits":4}' || "got " + JSON.stringify(settings)`}]},{id:`js-json`,language:`javascript`,title:`JSON`,level:`intermediate`,minutes:8,text:E("**JSON** is the text format most web services and data files use. `JSON.stringify(value)` turns an object into text (`JSON.stringify(value, null, 2)` indents it); `JSON.parse(text)` turns text back into an object. Functions and `undefined` are dropped; invalid text throws a `SyntaxError`.",O(k`
              const text = '{"sample": "A", "values": [1, 2, 3]}';
              const data = JSON.parse(text);
              console.log(data.sample, data.values.length);
              console.log(JSON.stringify({ ok: true, n: 3 }));
            `)),task:"Parse `text` into `data`, collect the `name` of every entry of `data.items` in `names`, and make `copy`: the JSON text of `{ names }` with indentation of 2 spaces.",code:k`
            const text = '{"items": [{"name": "Na", "z": 11}, {"name": "Cl", "z": 17}, {"name": "K", "z": 19}]}';

            let data, names, copy;
            console.log(data, names, copy);
          `,hint:`const data = JSON.parse(text); const names = data.items.map((i) => i.name); const copy = JSON.stringify({ names }, null, 2);`,solution:k`
            const text = '{"items": [{"name": "Na", "z": 11}, {"name": "Cl", "z": 17}, {"name": "K", "z": 19}]}';

            const data = JSON.parse(text);
            const names = data.items.map((i) => i.name);
            const copy = JSON.stringify({ names }, null, 2);
            console.log(data, names, copy);
          `,checks:[{label:`data has 3 items`,test:`Boolean(data && data.items && data.items.length === 3)`},{label:`names is ["Na", "Cl", "K"]`,test:`JSON.stringify(names) === '["Na","Cl","K"]' || "got " + JSON.stringify(names)`},{label:`copy is JSON text with 2-space indentation`,test:`typeof copy === "string" && copy.includes("\\n  \\"names\\"") && JSON.parse(copy).names.length === 3`}]}]},{id:`js-advanced`,title:`Classes, errors, async`,lessons:[{id:`js-classes`,language:`javascript`,title:`Classes`,level:`intermediate`,minutes:10,text:E("A **class** is a blueprint for objects. `constructor` sets up a new one (`new Vector(3, 4)`), methods are functions on it, `this` is the object, and a `get` property is calculated when read. `extends` builds on another class.",O(k`
              class Point {
                constructor(x, y) {
                  this.x = x;
                  this.y = y;
                }
                get norm() {
                  return Math.hypot(this.x, this.y);
                }
              }
              console.log(new Point(3, 4).norm);   // 5
            `)),task:"Finish `Vector`: the method `add(other)` returns a **new** Vector (the sum), and the getter `length` returns the length (√(x²+y²)).",code:k`
            class Vector {
              constructor(x, y) {
                this.x = x;
                this.y = y;
              }

              add(other) {
                return this;
              }

              get length() {
                return 0;
              }
            }

            const v = new Vector(3, 4).add(new Vector(0, 0));
            console.log(v.length);
          `,hint:`add: return new Vector(this.x + other.x, this.y + other.y);   length: return Math.hypot(this.x, this.y);`,solution:k`
            class Vector {
              constructor(x, y) {
                this.x = x;
                this.y = y;
              }

              add(other) {
                return new Vector(this.x + other.x, this.y + other.y);
              }

              get length() {
                return Math.hypot(this.x, this.y);
              }
            }

            const v = new Vector(3, 4).add(new Vector(0, 0));
            console.log(v.length);
          `,checks:[{label:`new Vector(3, 4).length is 5`,test:`new Vector(3, 4).length === 5 || "got " + new Vector(3, 4).length`},{label:`add gives the sum (1,2)+(3,4) = (4,6)`,test:`(() => { const s = new Vector(1, 2).add(new Vector(3, 4)); return s.x === 4 && s.y === 6; })()`},{label:`add does not change the original`,test:`(() => { const a = new Vector(1, 2); a.add(new Vector(5, 5)); return a.x === 1 && a.y === 2; })()`}]},{id:`js-errors`,language:`javascript`,title:`Errors and try/catch`,level:`intermediate`,minutes:8,text:E('When something fails JavaScript **throws** an error and stops, unless you catch it: `try { … } catch (error) { … } finally { … }`. Throw your own with `throw new RangeError("message")`. Errors have a `name` and a `message`.',O(k`
              try {
                JSON.parse("{not json}");
              } catch (error) {
                console.log(error.name + ": " + error.message);
              }
            `),`kCode shows an uncaught error with the line it came from; click the line number to jump there.`),task:"Write `divide(a, b)`: it returns a / b, but throws a `RangeError` when b is 0. Write `parseOr(text, fallback)`: the parsed JSON, or `fallback` if the text is not valid JSON.",code:k`
            function divide(a, b) {
              return a / b;
            }

            function parseOr(text, fallback) {
              return JSON.parse(text);
            }

            console.log(divide(6, 3), parseOr("[1,2]", null));
          `,hint:`divide: if (b === 0) throw new RangeError("division by zero");  parseOr: wrap JSON.parse in try { … } catch { return fallback; }`,solution:k`
            function divide(a, b) {
              if (b === 0) throw new RangeError("division by zero");
              return a / b;
            }

            function parseOr(text, fallback) {
              try {
                return JSON.parse(text);
              } catch {
                return fallback;
              }
            }

            console.log(divide(6, 3), parseOr("[1,2]", null));
          `,checks:[{label:`divide(6, 3) is 2`,test:`divide(6, 3) === 2`},{label:`divide(1, 0) throws a RangeError`,test:`(() => { try { divide(1, 0); } catch (e) { return e instanceof RangeError || "threw " + e.name; } return "it did not throw"; })()`},{label:`parseOr("[1,2]", null) is [1, 2]`,test:`JSON.stringify(parseOr("[1,2]", null)) === "[1,2]"`},{label:`parseOr("{oops", 42) is 42`,test:`parseOr("{oops", 42) === 42`}]},{id:`js-promises`,language:`javascript`,title:`Promises and async/await`,level:`advanced`,minutes:12,text:E("Some things take time: a download, a timer. A **Promise** stands for a value that will arrive. `async` functions return promises, and `await` pauses until one is ready — in kCode, `await` also works at the top of your code.",O(k`
              const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

              async function main() {
                console.log("start");
                await pause(100);
                console.log("100 ms later");
              }
              await main();
            `),"`Promise.all([a, b, c])` waits for several promises at once and gives all results in order. `try { await … } catch (e) { … }` catches failures."),task:'Write `wait(ms, value)`: it returns a promise that resolves to `value` after `ms` milliseconds. Then set `results` to what `Promise.all` gives for `wait(30, "a")`, `wait(10, "b")`, `wait(20, "c")`.',code:k`
            function wait(ms, value) {
              return null;
            }

            let results;
            console.log(results);
          `,hint:`return new Promise((resolve) => setTimeout(() => resolve(value), ms));   results = await Promise.all([wait(30, "a"), wait(10, "b"), wait(20, "c")]);`,solution:k`
            function wait(ms, value) {
              return new Promise((resolve) => setTimeout(() => resolve(value), ms));
            }

            const results = await Promise.all([wait(30, "a"), wait(10, "b"), wait(20, "c")]);
            console.log(results);
          `,checks:[{label:`wait(5, "x") gives "x"`,test:`(await wait(5, "x")) === "x"`},{label:`results is ["a", "b", "c"] (in the order asked)`,test:`JSON.stringify(results) === '["a","b","c"]' || "got " + JSON.stringify(results)`}]}]}]},{id:`lab-recipes`,title:`Lab recipes`,language:`python`,blurb:`Calibration lines, unit conversion, titration curves, error propagation, Monte-Carlo and CSV files.`,chapters:[{id:`lab-data`,title:`Measurements and data`,lessons:[{id:`lab-line-fit`,language:`python`,title:`Fit a calibration line`,level:`intermediate`,minutes:12,needs:[`numpy`],text:E("A **calibration curve** relates a signal (absorbance) to a concentration. For a straight line `y = m·x + c`, `np.polyfit(x, y, 1)` returns `m` and `c`. How good is the line? **R²** is 1 for a perfect fit: `1 − Σ(residual²) / Σ(y − mean)²`.",D(k`
              import numpy as np

              x = np.array([0.0, 1.0, 2.0, 3.0])
              y = np.array([0.1, 1.9, 4.1, 5.9])
              m, c = np.polyfit(x, y, 1)
              predicted = m * x + c
              r2 = 1 - ((y - predicted) ** 2).sum() / ((y - y.mean()) ** 2).sum()
              print(m, c, r2)
            `),"Once you have the line, you can read an unknown sample back: `concentration = (absorbance − c) / m`."),task:"Fit the Beer–Lambert data: set `slope`, `intercept` and `r2`. Then compute `unknown`, the concentration (mg/L) of a sample whose absorbance is 0.380.",code:k`
            import numpy as np

            conc = np.array([0.0, 2.0, 4.0, 6.0, 8.0, 10.0])               # mg/L
            absorbance = np.array([0.002, 0.152, 0.310, 0.451, 0.607, 0.752])

            slope, intercept, r2, unknown = None, None, None, None
            print(slope, intercept, r2, unknown)
          `,hint:`slope, intercept = np.polyfit(conc, absorbance, 1).  predicted = slope * conc + intercept.  unknown = (0.380 - intercept) / slope.`,solution:k`
            import numpy as np

            conc = np.array([0.0, 2.0, 4.0, 6.0, 8.0, 10.0])               # mg/L
            absorbance = np.array([0.002, 0.152, 0.310, 0.451, 0.607, 0.752])

            slope, intercept = np.polyfit(conc, absorbance, 1)
            predicted = slope * conc + intercept
            r2 = 1 - ((absorbance - predicted) ** 2).sum() / ((absorbance - absorbance.mean()) ** 2).sum()
            unknown = (0.380 - intercept) / slope
            print(f"A = {slope:.4f} c + {intercept:.4f}  (R² = {r2:.5f})")
            print(f"unknown: {unknown:.2f} mg/L")
          `,checks:[{label:`slope is 0.0751 per mg/L`,test:`assert abs(slope - 0.075086) < 1e-5, slope`},{label:`intercept is 0.0036`,test:`assert abs(intercept - 0.003571) < 1e-5, intercept`},{label:`r2 is 0.99983`,test:`assert abs(r2 - 0.999834) < 1e-5, r2`},{label:`unknown is 5.02 mg/L`,test:`assert abs(unknown - 5.0214) < 1e-2, unknown`}]},{id:`lab-csv`,language:`python`,title:`Parse a CSV file`,level:`intermediate`,minutes:10,text:E('Instruments export **CSV** (comma-separated values). The `csv` module reads it: `csv.DictReader` gives one dictionary per row, keyed by the header. Everything arrives as text — convert numbers with `float()`. To read a real file: `open(path, newline="")` instead of the `StringIO` used here for the text.',D(k`
              import csv, io

              text = "name,mass\nA,1.5\nB,2.5"
              rows = list(csv.DictReader(io.StringIO(text)))
              print(rows[0]["name"], float(rows[1]["mass"]))
            `)),task:"Read `text`: `rows` (a list of dictionaries), `mean_ph` (the mean of the pH column, as a number), and `warm` (the names of the samples whose temperature is above 25).",code:k`
            import csv, io

            text = "name,ph,temp\nlake,7.8,18.5\nriver,7.2,22.0\nspring,6.9,9.5\npond,8.1,27.4\nsea,8.0,26.1"

            rows = []
            mean_ph = None
            warm = []
            print(rows, mean_ph, warm)
          `,hint:`rows = list(csv.DictReader(io.StringIO(text))).  mean_ph = sum(float(r["ph"]) for r in rows) / len(rows).  warm = [r["name"] for r in rows if float(r["temp"]) > 25]`,solution:k`
            import csv, io

            text = "name,ph,temp\nlake,7.8,18.5\nriver,7.2,22.0\nspring,6.9,9.5\npond,8.1,27.4\nsea,8.0,26.1"

            rows = list(csv.DictReader(io.StringIO(text)))
            mean_ph = sum(float(r["ph"]) for r in rows) / len(rows)
            warm = [r["name"] for r in rows if float(r["temp"]) > 25]
            print(rows, mean_ph, warm)
          `,checks:[{label:`rows has 5 dictionaries with the header names`,test:`assert len(rows) == 5 and rows[0]["name"] == "lake" and "ph" in rows[0], rows[:1]`},{label:`mean_ph is 7.6`,test:`assert abs(mean_ph - 7.6) < 1e-9, mean_ph`},{label:`warm is ["pond", "sea"]`,test:`assert warm == ["pond", "sea"], warm`}]},{id:`lab-units`,language:`python`,title:`Unit conversion`,level:`intermediate`,minutes:10,text:E("A tidy way to convert units: store each unit as a factor to a base unit of its kind (metre for lengths, pascal for pressures). Then `value × factor(from) / factor(to)` converts any pair, and a mismatch between kinds can be refused.",D(k`
              LENGTH = {"m": 1.0, "cm": 0.01, "in": 0.0254}
              print(2.5 * LENGTH["in"] / LENGTH["cm"], "cm")
            `),"Raise `ValueError` with a clear message when the units do not belong together."),task:"Write `convert(value, source, target)` for the units in `UNITS` (each is `(kind, factor to the base unit)`). Converting between different kinds, like m to Pa, raises a `ValueError`.",code:k`
            UNITS = {
                "m": ("length", 1.0), "cm": ("length", 0.01), "mm": ("length", 0.001), "in": ("length", 0.0254),
                "Pa": ("pressure", 1.0), "kPa": ("pressure", 1000.0), "bar": ("pressure", 1e5), "atm": ("pressure", 101325.0),
            }

            def convert(value, source, target):
                return value

            print(convert(1, "atm", "kPa"))
          `,hint:`kind_a, f_a = UNITS[source]; kind_b, f_b = UNITS[target]; if kind_a != kind_b: raise ValueError(...); return value * f_a / f_b`,solution:k`
            UNITS = {
                "m": ("length", 1.0), "cm": ("length", 0.01), "mm": ("length", 0.001), "in": ("length", 0.0254),
                "Pa": ("pressure", 1.0), "kPa": ("pressure", 1000.0), "bar": ("pressure", 1e5), "atm": ("pressure", 101325.0),
            }

            def convert(value, source, target):
                kind_a, factor_a = UNITS[source]
                kind_b, factor_b = UNITS[target]
                if kind_a != kind_b:
                    raise ValueError(f"cannot convert {kind_a} ({source}) to {kind_b} ({target})")
                return value * factor_a / factor_b

            print(convert(1, "atm", "kPa"))
          `,checks:[{label:`convert(100, "cm", "m") is 1`,test:`assert abs(convert(100, "cm", "m") - 1) < 1e-12`},{label:`convert(1, "atm", "kPa") is 101.325`,test:`assert abs(convert(1, "atm", "kPa") - 101.325) < 1e-9`},{label:`convert(1, "in", "mm") is 25.4`,test:`assert abs(convert(1, "in", "mm") - 25.4) < 1e-9`},{label:`convert(1, "m", "Pa") raises ValueError`,test:`try:
    convert(1, "m", "Pa")
except ValueError:
    pass
else:
    raise AssertionError("no ValueError")`}]}]},{id:`lab-chem`,title:`Chemistry and statistics`,lessons:[{id:`lab-titration`,language:`python`,title:`Titration curve`,level:`advanced`,minutes:14,text:E(`Titrating 25.0 mL of 0.100 M HCl with 0.100 M NaOH: before the equivalence point the pH comes from the acid that is left, at it the solution is neutral (pH 7), after it from the excess base.`,`- acid left: [H⁺] = (n_acid − n_base) / total volume, pH = −log₁₀[H⁺]
- equivalence: n_base = n_acid, pH = 7
- excess base: [OH⁻] = (n_base − n_acid) / total volume, pH = 14 + log₁₀[OH⁻]`,"Amounts n are in millimoles (mL × mol/L), volumes in mL. Use `math.log10`."),task:"Write `ph_after(v_ml)`: the pH after adding `v_ml` of NaOH. Check: 0 mL gives 1.0, 25 mL gives 7.0, 30 mL gives 11.96.",code:k`
            import math

            ACID_ML, ACID_M, BASE_M = 25.0, 0.100, 0.100

            def ph_after(v_ml):
                n_acid = ACID_ML * ACID_M      # mmol of HCl
                n_base = v_ml * BASE_M         # mmol of NaOH added
                return 7.0

            for v in [0, 12.5, 25, 30]:
                print(v, round(ph_after(v), 2))
          `,hint:`total = ACID_ML + v_ml. If n_base < n_acid: return -math.log10((n_acid - n_base) / total). If equal (within 1e-9): 7.0. Else: return 14 + math.log10((n_base - n_acid) / total).`,solution:k`
            import math

            ACID_ML, ACID_M, BASE_M = 25.0, 0.100, 0.100

            def ph_after(v_ml):
                n_acid = ACID_ML * ACID_M      # mmol of HCl
                n_base = v_ml * BASE_M         # mmol of NaOH added
                total = ACID_ML + v_ml
                if abs(n_base - n_acid) < 1e-9:
                    return 7.0
                if n_base < n_acid:
                    return -math.log10((n_acid - n_base) / total)
                return 14 + math.log10((n_base - n_acid) / total)

            for v in [0, 12.5, 25, 30]:
                print(v, round(ph_after(v), 2))
          `,checks:[{label:`ph_after(0) is 1.00`,test:`assert abs(ph_after(0) - 1.0) < 0.01, ph_after(0)`},{label:`ph_after(12.5) is 1.48`,test:`assert abs(ph_after(12.5) - 1.477) < 0.01, ph_after(12.5)`},{label:`ph_after(25) is 7.00 (equivalence point)`,test:`assert abs(ph_after(25) - 7.0) < 0.01, ph_after(25)`},{label:`ph_after(30) is 11.96`,test:`assert abs(ph_after(30) - 11.959) < 0.01, ph_after(30)`}]},{id:`lab-error-propagation`,language:`python`,title:`Error propagation`,level:`advanced`,minutes:12,text:E("A result calculated from measurements inherits their uncertainties. For a **product or quotient** of independent quantities the *relative* errors add in quadrature: for `f = a / b`,",D(`σf / f = sqrt( (σa / a)² + (σb / b)² )`),`For a sum or difference the *absolute* errors add in quadrature. Report the result with the error to one or two significant figures.`),task:"Write `quotient_error(a, da, b, db)` returning the pair `(value, sigma)` of a / b. Use it for a density: mass 12.50 ± 0.05 g, volume 5.0 ± 0.1 mL, in `density, sigma_density`.",code:k`
            import math

            def quotient_error(a, da, b, db):
                return (0.0, 0.0)

            density, sigma_density = quotient_error(12.50, 0.05, 5.0, 0.1)
            print(f"density = {density:.3f} ± {sigma_density:.3f} g/mL")
          `,hint:`value = a / b; then sigma = abs(value) * math.sqrt((da / a) ** 2 + (db / b) ** 2). Return (value, sigma).`,solution:k`
            import math

            def quotient_error(a, da, b, db):
                value = a / b
                sigma = abs(value) * math.sqrt((da / a) ** 2 + (db / b) ** 2)
                return (value, sigma)

            density, sigma_density = quotient_error(12.50, 0.05, 5.0, 0.1)
            print(f"density = {density:.3f} ± {sigma_density:.3f} g/mL")
          `,checks:[{label:`the value is a / b`,test:`assert abs(quotient_error(6.0, 0.1, 3.0, 0.1)[0] - 2.0) < 1e-12`},{label:`the error follows the quadrature rule`,test:`assert abs(quotient_error(12.5, 0.05, 5.0, 0.1)[1] - 0.05099) < 1e-4, quotient_error(12.5, 0.05, 5.0, 0.1)`},{label:`density is 2.5 ± 0.051`,test:`assert abs(density - 2.5) < 1e-9 and abs(sigma_density - 0.05099) < 1e-4, (density, sigma_density)`}]},{id:`lab-monte-carlo`,language:`python`,title:`Monte-Carlo estimate of π`,level:`intermediate`,minutes:10,text:E("Throw random darts at a unit square. The share that lands inside the quarter circle `x² + y² ≤ 1` is π/4. So `4 × inside / total` estimates π. Monte-Carlo methods answer hard questions by random sampling; the error shrinks like 1/√n.",D(k`
              import random

              rng = random.Random(1)       # a seed: the same "random" numbers every run
              x, y = rng.random(), rng.random()
              print(x, y, x * x + y * y <= 1)
            `)),task:"Write `estimate_pi(n, seed=1)`: throw `n` random points with `random.Random(seed)` and return the estimate of π as a float.",code:k`
            import random

            def estimate_pi(n, seed=1):
                return 0.0

            print(estimate_pi(100_000))
          `,hint:`rng = random.Random(seed); inside = 0; loop n times: x, y = rng.random(), rng.random(); if x * x + y * y <= 1: inside += 1. Return 4 * inside / n.`,solution:k`
            import random

            def estimate_pi(n, seed=1):
                rng = random.Random(seed)
                inside = 0
                for _ in range(n):
                    x, y = rng.random(), rng.random()
                    if x * x + y * y <= 1:
                        inside += 1
                return 4 * inside / n

            print(estimate_pi(100_000))
          `,checks:[{label:`estimate_pi(100000) is close to π`,test:`assert abs(estimate_pi(100_000) - 3.14159) < 0.02, estimate_pi(100_000)`},{label:`the same seed gives the same estimate`,test:`assert estimate_pi(2000, seed=5) == estimate_pi(2000, seed=5)`},{label:`another seed gives another estimate`,test:`assert estimate_pi(2000, seed=5) != estimate_pi(2000, seed=6)`},{label:`the result is a float`,test:`assert isinstance(estimate_pi(10), float)`}]},{id:`lab-js-statistics`,language:`javascript`,title:`Mean and standard deviation in JavaScript`,level:`intermediate`,minutes:10,text:E("The same statistics in JavaScript: the **mean** is the sum over the count; the **sample standard deviation** divides the sum of squared deviations by `n − 1`. Write them as small, pure functions that take an array.",O(k`
              const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
              console.log(mean([2, 4, 6]));   // 4
            `)),task:"Write `mean(values)` and `stdev(values)` (sample standard deviation, dividing by n − 1).",code:k`
            const mean = (values) => 0;
            const stdev = (values) => 0;

            const data = [2, 4, 4, 4, 5, 5, 7, 9];
            console.log(mean(data), stdev(data));
          `,hint:`stdev: const m = mean(values); const ss = values.reduce((s, v) => s + (v - m) ** 2, 0); return Math.sqrt(ss / (values.length - 1));`,solution:k`
            const mean = (values) => values.reduce((s, v) => s + v, 0) / values.length;
            const stdev = (values) => {
              const m = mean(values);
              const ss = values.reduce((s, v) => s + (v - m) ** 2, 0);
              return Math.sqrt(ss / (values.length - 1));
            };

            const data = [2, 4, 4, 4, 5, 5, 7, 9];
            console.log(mean(data), stdev(data));
          `,checks:[{label:`mean([2, 4, 6]) is 4`,test:`mean([2, 4, 6]) === 4 || "got " + mean([2, 4, 6])`},{label:`mean(data) is 5`,test:`mean(data) === 5 || "got " + mean(data)`},{label:`stdev(data) is 2.138 (n − 1)`,test:`Math.abs(stdev(data) - 2.13809) < 1e-4 || "got " + stdev(data)`}]}]}]}],N=Pe.flatMap(e=>e.chapters.flatMap(e=>e.lessons)),P=new Map;N.forEach((e,t)=>{for(let n of Pe)for(let r of n.chapters)r.lessons.includes(e)&&P.set(e.id,{lesson:e,course:n,chapter:r,index:t})});var Fe=e=>P.get(e)?.lesson,Ie=e=>P.get(e);function Le(e,t){let n=P.get(e);return n?N[n.index+t]??null:null}function Re(e,t=e=>e.text){let n=e.toLowerCase().split(/\s+/).filter(Boolean);return n.length?N.filter(e=>{let r=P.get(e.id),i=`${e.title} ${r.course.title} ${r.chapter.title} ${e.level} ${e.language} ${t(e)}`.toLowerCase();return n.every(e=>i.includes(e))}):N}var ze=/^https?:\/\/[^\s<>"']+$/i;function F(e){let t=[],n=``,r=()=>{n&&t.push({t:`text`,s:n}),n=``},i=0;for(;i<e.length;){let a=e[i];if(a===`\\`&&i+1<e.length&&"\\`*[]()#_-".includes(e[i+1])){n+=e[i+1],i+=2;continue}if(a==="`"){let n=e.indexOf("`",i+1);if(n>i){r(),t.push({t:`code`,s:e.slice(i+1,n)}),i=n+1;continue}}if(a===`*`&&e[i+1]===`*`){let n=e.indexOf(`**`,i+2);if(n>i+2){r(),t.push({t:`b`,c:F(e.slice(i+2,n))}),i=n+2;continue}}if(a===`*`&&e[i+1]!==` `&&e[i+1]!==`*`){let n=e.indexOf(`*`,i+1);if(n>i+1&&e[n-1]!==` `){r(),t.push({t:`i`,c:F(e.slice(i+1,n))}),i=n+1;continue}}if(a===`[`){let n=e.indexOf(`](`,i+1),a=n>0?e.indexOf(`)`,n+2):-1;if(n>0&&a>n){let o=e.slice(n+2,a);if(ze.test(o)){r(),t.push({t:`a`,href:o,c:F(e.slice(i+1,n))}),i=a+1;continue}}}n+=a,i++}return r(),t}function I(e){let t=e.replace(/\r\n?/g,`
`).split(`
`),n=[],r=[],i=()=>{r.length&&n.push({t:`p`,c:F(r.join(` `))}),r=[]};for(let e=0;e<t.length;e++){let a=t[e],o=/^```\s*([\w+-]*)\s*$/.exec(a);if(o){i();let r=[];for(e++;e<t.length&&!/^```\s*$/.test(t[e]);)r.push(t[e++]);n.push({t:`code`,lang:o[1],text:r.join(`
`)});continue}if(!a.trim()){i();continue}let s=/^(#{1,3})\s+(.*)$/.exec(a);if(s){i(),n.push({t:`h`,level:s[1].length,c:F(s[2].trim())});continue}if(/^(-{3,}|\*{3,})\s*$/.test(a)){i(),n.push({t:`hr`});continue}let c=/^>\s?(.*)$/.exec(a);if(c){i();let r=[c[1]];for(;e+1<t.length&&/^>\s?/.test(t[e+1]);)r.push(t[++e].replace(/^>\s?/,``));n.push({t:`quote`,c:F(r.join(` `))});continue}let l=/^\s*([-*]|\d+\.)\s+(.*)$/.exec(a);if(l){i();let r=/\d/.test(l[1]),a=[l[2]];for(;e+1<t.length;){let n=t[e+1],i=/^\s*([-*]|\d+\.)\s+(.*)$/.exec(n);if(i&&/\d/.test(i[1])===r)a.push(i[2]),e++;else if(/^\s{2,}\S/.test(n)&&!i)a[a.length-1]+=` `+n.trim(),e++;else break}n.push({t:r?`ol`:`ul`,items:a.map(F)});continue}r.push(a.trim())}return i(),n}var L=e=>e.map(e=>e.t===`text`||e.t===`code`?e.s:L(e.c)).join(``);function Be(e){return e.map(e=>{switch(e.t){case`code`:return e.text;case`hr`:return``;case`ul`:case`ol`:return e.items.map(L).join(`
`);default:return L(e.c)}}).join(`
`)}function R({nodes:e}){return(0,w.jsx)(w.Fragment,{children:e.map((e,t)=>{switch(e.t){case`text`:return(0,w.jsx)(`span`,{children:e.s},t);case`code`:return(0,w.jsx)(`code`,{className:`kcd-ic`,children:e.s},t);case`b`:return(0,w.jsx)(`strong`,{children:(0,w.jsx)(R,{nodes:e.c})},t);case`i`:return(0,w.jsx)(`em`,{children:(0,w.jsx)(R,{nodes:e.c})},t);case`a`:return(0,w.jsx)(`a`,{href:e.href,className:`kcd-link`,onClick:t=>{t.preventDefault(),a.openUrl(e.href)},children:(0,w.jsx)(R,{nodes:e.c})},t)}})})}var Ve={python:`python`,py:`python`,javascript:`javascript`,js:`javascript`};function z({text:e,lang:t,fontSize:n=12.5}){let r=Ve[t.toLowerCase()];return(0,w.jsxs)(`div`,{className:`kcd-block`,children:[r?(0,w.jsx)(ve,{value:e,language:r,readOnly:!0,autoHeight:!0,fontSize:n,wrap:!0}):(0,w.jsx)(`pre`,{className:`kcd-plain`,children:e}),(0,w.jsx)(`button`,{className:`k-icon-btn kcd-copy`,title:`Copy`,"aria-label":`Copy the code`,onClick:()=>{try{navigator.clipboard?.writeText(e)}catch{}},children:(0,w.jsx)(pe,{size:13})})]})}function He({b:e,fontSize:t}){let n=t-.5;switch(e.t){case`h`:return e.level===1?(0,w.jsx)(`h2`,{className:`kcd-h1`,children:(0,w.jsx)(R,{nodes:e.c})}):e.level===2?(0,w.jsx)(`h3`,{className:`kcd-h2`,children:(0,w.jsx)(R,{nodes:e.c})}):(0,w.jsx)(`h4`,{className:`kcd-h3`,children:(0,w.jsx)(R,{nodes:e.c})});case`p`:return(0,w.jsx)(`p`,{children:(0,w.jsx)(R,{nodes:e.c})});case`ul`:return(0,w.jsx)(`ul`,{children:e.items.map((e,t)=>(0,w.jsx)(`li`,{children:(0,w.jsx)(R,{nodes:e})},t))});case`ol`:return(0,w.jsx)(`ol`,{children:e.items.map((e,t)=>(0,w.jsx)(`li`,{children:(0,w.jsx)(R,{nodes:e})},t))});case`quote`:return(0,w.jsx)(`blockquote`,{children:(0,w.jsx)(R,{nodes:e.c})});case`code`:return(0,w.jsx)(z,{text:e.text,lang:e.lang,fontSize:n});case`hr`:return(0,w.jsx)(`hr`,{})}}var B=(0,x.memo)(function({text:e,fontSize:t=13}){let n=(0,x.useMemo)(()=>I(e),[e]);return(0,w.jsx)(`div`,{className:`kcd-md`,style:{fontSize:t},children:n.map((e,n)=>(0,w.jsx)(He,{b:e,fontSize:t},n))})}),V={beginner:`Beginner`,intermediate:`Intermediate`,advanced:`Advanced`};function Ue(e){let{lesson:t,checkView:n}=e,r=(0,x.useRef)(null);(0,x.useEffect)(()=>{r.current?.scrollTo({top:0})},[t.id]);let a=n?Te(n.results):null,o=!!a?.allPassed&&!n?.stale;return(0,w.jsxs)(`div`,{className:`kcd-lesson`,ref:r,children:[(0,w.jsxs)(`div`,{className:`kcd-crumb`,children:[e.course.title,` › `,e.chapter.title]}),(0,w.jsxs)(`div`,{className:`kcd-title-row`,children:[(0,w.jsx)(`h2`,{className:`kcd-title`,children:t.title}),e.done&&(0,w.jsxs)(`span`,{className:`kcd-done-badge`,title:`You completed this lesson`,children:[(0,w.jsx)(u,{size:13}),` Done`]})]}),(0,w.jsxs)(`div`,{className:`kcd-badges`,children:[(0,w.jsx)(`span`,{className:`kcd-badge ${t.level}`,children:V[t.level]}),(0,w.jsxs)(`span`,{className:`kcd-badge`,children:[(0,w.jsx)(f,{size:11}),` `,t.minutes,` min`]}),(0,w.jsx)(`span`,{className:`kcd-badge`,children:t.language===`python`?`Python`:`JavaScript`})]}),(0,w.jsx)(B,{text:t.text,fontSize:e.fontSize}),t.task&&(0,w.jsxs)(`div`,{className:`kcd-task`,children:[(0,w.jsx)(`div`,{className:`kcd-task-head`,children:`Your turn`}),(0,w.jsx)(B,{text:t.task,fontSize:e.fontSize}),t.checks&&(0,w.jsx)(`ul`,{className:`kcd-checks`,"aria-label":`What is checked`,children:t.checks.map((e,t)=>{let r=n?.results.find(t=>t.label===e.label),i=!r||n?.stale?`pending`:r.ok?`ok`:`fail`;return(0,w.jsxs)(`li`,{className:i,children:[(0,w.jsx)(`span`,{className:`kcd-check-mark`,"aria-label":i===`ok`?`Passed`:i===`fail`?`Failed`:`Not checked yet`,children:i===`ok`?`✓`:i===`fail`?`✗`:`○`}),(0,w.jsxs)(`span`,{children:[e.label,i===`fail`&&r?.detail?(0,w.jsxs)(`em`,{className:`kcd-why`,children:[` — `,r.detail]}):null]})]},t)})})]}),o&&(0,w.jsxs)(`div`,{className:`kcd-success`,role:`status`,children:[(0,w.jsx)(u,{size:16}),(0,w.jsxs)(`div`,{children:[(0,w.jsxs)(`strong`,{children:[a.headline,`.`]}),` Well done — this lesson is complete.`]}),e.next&&(0,w.jsxs)(`button`,{className:`k-btn small primary`,onClick:e.onNext,children:[`Next lesson `,(0,w.jsx)(l,{size:13})]})]}),(t.hint||t.solution)&&(0,w.jsxs)(`div`,{className:`kcd-help`,children:[t.hint&&(0,w.jsxs)(`div`,{children:[(0,w.jsxs)(`button`,{className:`k-btn small`,onClick:e.hintShown?()=>e.onClose(`hint`):e.onHint,"aria-expanded":e.hintShown,children:[(0,w.jsx)(be,{size:13}),` `,e.hintShown?`Hide hint`:`Show hint`]}),e.hintShown&&(0,w.jsx)(`p`,{className:`kcd-reveal`,children:(0,w.jsx)(`span`,{children:t.hint})})]}),t.solution&&(0,w.jsxs)(`div`,{children:[(0,w.jsxs)(`button`,{className:`k-btn small`,onClick:e.solutionShown?()=>e.onClose(`solution`):e.onSolution,"aria-expanded":e.solutionShown,children:[e.solutionShown?(0,w.jsx)(i,{size:13}):(0,w.jsx)(ne,{size:13}),` `,e.solutionShown?`Hide solution`:`Show solution`]}),e.solutionShown&&(0,w.jsxs)(`div`,{className:`kcd-reveal`,children:[(0,w.jsx)(z,{text:t.solution.replace(/\n$/,``),lang:t.language,fontSize:e.fontSize-.5}),(0,w.jsx)(`button`,{className:`k-btn small`,onClick:e.onUseSolution,children:`Use this code in the editor`})]})]})]}),!o&&e.done&&e.next&&(0,w.jsx)(`div`,{className:`kcd-nextrow`,children:(0,w.jsxs)(`button`,{className:`k-btn small`,onClick:e.onNext,children:[`Next lesson `,(0,w.jsx)(l,{size:13})]})})]})}function We(e){return(e.checks??[]).filter(e=>!e.test.includes(`OUTPUT`)).map(e=>`# ${e.label}\n${e.test}`).join(`

`)}function Ge(e,t){let n=[{type:`markdown`,source:`# ${e.title}\n\n${e.text}${e.task?`\n\n**Your turn.** ${e.task}`:``}`},{type:`code`,source:t.replace(/\n$/,``)}],r=We(e);return r&&(n.push({type:`markdown`,source:`## Check your work

Run this cell after your code: each check passes when nothing is raised.`}),n.push({type:`code`,source:r})),{format:`kbook`,version:1,cells:n}}var Ke=e=>e<1e3?`${Math.round(e)} ms`:`${(e/1e3).toFixed(e<1e4?2:1)} s`;function qe(e){let{report:t}=e,n=!e.running&&!e.segs.length&&!e.figures.length&&!t,r=t?.checks?Te(t.checks):null;return(0,w.jsxs)(`div`,{className:`kcd-output`,"aria-label":`Output`,children:[(0,w.jsxs)(`div`,{className:`kcd-out-head`,children:[(0,w.jsx)(`span`,{className:`kcd-out-title`,children:`Output`}),e.runNo>0&&(0,w.jsxs)(`span`,{className:`kcd-out-meta`,children:[`[`,e.runNo,`] `,e.running?`running…`:t?Ke(t.ms):``]}),(0,w.jsx)(`span`,{className:`k-spacer`}),(0,w.jsx)(`button`,{className:`k-icon-btn`,title:`Clear the output`,"aria-label":`Clear the output`,onClick:e.onClear,disabled:n,children:(0,w.jsx)(te,{size:14})})]}),e.showInput&&(0,w.jsxs)(`div`,{className:`kcd-input`,children:[(0,w.jsxs)(`label`,{htmlFor:`kcd-answers`,children:[(0,w.jsx)(`code`,{children:`input()`}),` cannot ask for a keystroke here. Its answers come from this box, one line per call:`]}),(0,w.jsx)(`textarea`,{id:`kcd-answers`,className:`k-input`,rows:2,value:e.answers,placeholder:`Ada
42`,spellCheck:!1,onChange:t=>e.onAnswers(t.target.value)})]}),(0,w.jsxs)(`div`,{className:`kcd-out-body`,style:{fontSize:e.fontSize-1},children:[n&&(0,w.jsxs)(`p`,{className:`kcd-empty`,children:[`Run your code to see its output here. `,(0,w.jsx)(`span`,{className:`k-muted`,children:`Ctrl/Cmd+Enter runs, Shift+Ctrl/Cmd+Enter runs and checks.`})]}),e.segs.map((e,t)=>(0,w.jsx)(`pre`,{className:`kcd-seg ${e.kind}`,children:e.text},t)),t?.value!=null&&(0,w.jsx)(`pre`,{className:`kcd-value`,children:t.value}),e.figures.map((e,t)=>(0,w.jsx)(`img`,{className:`kcd-fig`,src:h(e),alt:`Figure ${t+1}`},t)),t?.error&&(0,w.jsxs)(`div`,{className:`kcd-error`,role:`alert`,children:[(0,w.jsxs)(`div`,{className:`kcd-error-head`,children:[(0,w.jsx)(`strong`,{children:t.error.name}),`: `,t.error.message,t.error.line!=null&&(0,w.jsxs)(`button`,{className:`k-link-btn`,onClick:()=>e.onJump(t.error.line),children:[`line `,t.error.line]})]}),t.error.traceback&&(0,w.jsxs)(`details`,{children:[(0,w.jsx)(`summary`,{children:`Full traceback`}),(0,w.jsx)(`pre`,{children:t.error.traceback})]})]}),t?.timedOut&&(0,w.jsx)(`p`,{className:`kcd-note warn`,children:`Stopped: the code ran for more than 5 seconds. Is there a loop that never ends? Nothing else was affected.`}),t?.stopped&&!t.timedOut&&(0,w.jsxs)(`p`,{className:`kcd-note`,children:[`Stopped.`,t.language===`python`?` Python was restarted: its variables are gone.`:``]}),r&&t?.checks&&(0,w.jsxs)(`div`,{className:`kcd-result ${r.allPassed?`ok`:`fail`}`,role:`status`,children:[(0,w.jsxs)(`div`,{className:`kcd-result-head`,children:[r.headline,r.allPassed?``:t.checks.find(e=>!e.ok)?`: keep going`:``]}),(0,w.jsx)(`ul`,{children:t.checks.map((e,t)=>(0,w.jsxs)(`li`,{className:e.ok?`ok`:`fail`,children:[(0,w.jsx)(`span`,{"aria-hidden":`true`,children:e.ok?`✓`:`✗`}),` `,e.label,!e.ok&&e.detail&&(0,w.jsxs)(`em`,{className:`kcd-why`,children:[` — `,e.detail]})]},t))})]})]})]})}var Je=`kcode.progress.v1`,Ye=`kcode.prefs.v1`,Xe=400,H=()=>({version:1,done:{},last:null,code:{},days:[],scratch:{python:``,javascript:``,language:`python`}});function Ze(e){let t=e=>String(e).padStart(2,`0`);return`${e.getFullYear()}-${t(e.getMonth()+1)}-${t(e.getDate())}`}function Qe(e,t){let[n,r,i]=e.split(`-`).map(Number);return Ze(new Date(n,r-1,i+t))}function $e(e,t){let n=new Set(e),r=0,i=n.has(t)?t:Qe(t,-1);for(;n.has(i);)r++,i=Qe(i,-1);let a=0;for(let e of n){if(n.has(Qe(e,-1)))continue;let t=0;for(let r=e;n.has(r);r=Qe(r,1))t++;a=Math.max(a,t)}return{current:r,best:a}}function et(e){let t=H();if(!e||typeof e!=`object`)return t;let n=e;if(n.done&&typeof n.done==`object`)for(let[e,r]of Object.entries(n.done))typeof r==`number`&&(t.done[e]=r);if(typeof n.last==`string`&&(t.last=n.last),n.code&&typeof n.code==`object`)for(let[e,r]of Object.entries(n.code))typeof r==`string`&&(t.code[e]=r);Array.isArray(n.days)&&(t.days=n.days.filter(e=>typeof e==`string`&&/^\d{4}-\d\d-\d\d$/.test(e)).slice(-400));let r=n.scratch;return r&&typeof r==`object`&&(typeof r.python==`string`&&(t.scratch.python=r.python),typeof r.javascript==`string`&&(t.scratch.javascript=r.javascript),(r.language===`python`||r.language===`javascript`)&&(t.scratch.language=r.language)),t}var tt=class{data;storage;key;now;constructor(e,t=Je,n=()=>new Date){this.storage=e,this.key=t,this.now=n,this.data=this.read()}read(){try{let e=this.storage?.getItem(this.key);return e?et(JSON.parse(e)):H()}catch{return H()}}save(){try{this.storage?.setItem(this.key,JSON.stringify(this.data))}catch{}}isDone(e){return e in this.data.done}doneIds(){return new Set(Object.keys(this.data.done))}markDone(e){this.isDone(e)||(this.data.done[e]=this.now().getTime()),this.touch(),this.save()}touch(){let e=Ze(this.now());this.data.days.includes(e)||(this.data.days.push(e),this.data.days.sort(),this.data.days.length>Xe&&(this.data.days=this.data.days.slice(-400)))}streak(){return $e(this.data.days,Ze(this.now()))}setLast(e){this.data.last!==e&&(this.data.last=e,this.save())}getCode(e){return this.data.code[e]??null}setCode(e,t,n){t===n?delete this.data.code[e]:this.data.code[e]=t,this.save()}setScratch(e,t){this.data.scratch[e]=t,this.data.scratch.language=e,this.save()}reset(){this.data=H();try{this.storage?.removeItem(this.key)}catch{}}},U={split:.4,editorShare:.55,font:13,sidebar:!0,folded:[]},W=(e,t,n)=>Math.min(n,Math.max(t,e));function nt(e,t=Ye){try{let n=JSON.parse(e?.getItem(t)??`null`);return!n||typeof n!=`object`?{...U}:{split:typeof n.split==`number`?W(n.split,.2,.7):U.split,editorShare:typeof n.editorShare==`number`?W(n.editorShare,.2,.85):U.editorShare,font:typeof n.font==`number`?W(Math.round(n.font),10,22):U.font,sidebar:typeof n.sidebar==`boolean`?n.sidebar:U.sidebar,folded:Array.isArray(n.folded)?n.folded.filter(e=>typeof e==`string`):[]}}catch{return{...U}}}function rt(e,t,n=Ye){try{e?.setItem(n,JSON.stringify(t))}catch{}}var G=e=>({language:e,ok:!1,segs:[],figures:[],value:null,error:null,checks:null,ms:0,stopped:!1,timedOut:!1}),K=2e5;function it(e,t){let n=0;for(let t of e)n+=t.text.length;if(n>=2e5)return!1;let r=n+t.text.length>2e5?t.text.slice(0,K-n):t.text,i=e[e.length-1];return i&&i.kind===t.kind&&t.kind!==`status`?e[e.length-1]={kind:i.kind,text:i.text+r}:e.push({kind:t.kind,text:r}),r.length<t.text.length&&e.push({kind:`status`,text:`
(output cut short)
`}),!0}function at(e){return`${e.name}: ${e.message}${e.line?` (line ${e.line})`:``}`}function ot(e,t=12e3){let n=[],r=e.segs.filter(e=>e.kind!==`status`).map(e=>e.text).join(``);r&&n.push(r.replace(/\n+$/,``)),e.value!==null&&n.push(`=> ${e.value}`),e.figures.length&&n.push(`(${e.figures.length} figure${e.figures.length>1?`s`:``} shown)`),e.error&&n.push(e.error.traceback?e.error.traceback:at(e.error)),e.timedOut?n.push(`Stopped: the code ran too long.`):e.stopped&&n.push(`Stopped.`);let i=n.join(`
`)||`(no output)`;return i.length>t?i.slice(0,t)+`
… (cut short)`:i}var st=String.raw`
var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
var realSetTimeout = self.setTimeout.bind(self);
var realSetInterval = self.setInterval.bind(self);
var realClearTimeout = self.clearTimeout.bind(self);
var realClearInterval = self.clearInterval.bind(self);

function isIdent(k) { return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k); }

function inspect(v, depth, seen, top) {
  depth = depth || 0; seen = seen || [];
  var t = typeof v;
  if (v === null) return 'null';
  if (t === 'undefined') return 'undefined';
  if (t === 'string') return top ? v : "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
  if (t === 'number') return Object.is(v, -0) ? '-0' : String(v);
  if (t === 'bigint') return String(v) + 'n';
  if (t === 'boolean') return String(v);
  if (t === 'symbol') return v.toString();
  if (t === 'function') {
    var src = Function.prototype.toString.call(v);
    if (/^class[\s{]/.test(src)) return '[class ' + (v.name || '(anonymous)') + (Object.getPrototypeOf(v) && Object.getPrototypeOf(v).name ? ' extends ' + Object.getPrototypeOf(v).name : '') + ']';
    return '[' + (/^async\b/.test(src) ? 'AsyncFunction' : 'Function') + (v.name ? ': ' + v.name : ' (anonymous)') + ']';
  }
  if (seen.indexOf(v) >= 0) return '[Circular]';
  if (v instanceof Error) {
    var head = (v.name || 'Error') + ': ' + v.message;
    return depth === 0 ? head : '[' + head + ']';
  }
  if (v instanceof Date) return isNaN(v) ? 'Invalid Date' : v.toISOString();
  if (v instanceof RegExp) return String(v);
  if (typeof Promise !== 'undefined' && v instanceof Promise) return 'Promise { <pending> }';
  if (typeof WeakMap !== 'undefined' && (v instanceof WeakMap || v instanceof WeakSet)) return v.constructor.name + ' { <items unknown> }';
  var isArr = Array.isArray(v);
  var isTyped = ArrayBuffer.isView(v) && !(v instanceof DataView);
  var isMap = v instanceof Map, isSet = v instanceof Set;
  if (depth > 3) return isArr ? '[Array]' : (isMap ? '[Map]' : (isSet ? '[Set]' : '[Object]'));
  var next = seen.concat([v]);
  var parts = [], prefix = '', open = '{', close = '}';
  var ctor = v.constructor && v.constructor.name;
  if (isArr || isTyped) {
    open = '['; close = ']';
    if (isTyped) prefix = ctor + '(' + v.length + ') ';
    var n = Math.min(v.length, 100);
    var holes = 0;
    for (var i = 0; i < n; i++) {
      if (isArr && !(i in v)) { holes++; continue; }
      if (holes) { parts.push('<' + holes + ' empty item' + (holes > 1 ? 's' : '') + '>'); holes = 0; }
      parts.push(inspect(v[i], depth + 1, next));
    }
    if (holes) parts.push('<' + holes + ' empty item' + (holes > 1 ? 's' : '') + '>');
    if (v.length > n) parts.push('... ' + (v.length - n) + ' more item' + (v.length - n > 1 ? 's' : ''));
    if (isArr) Object.keys(v).filter(function (k) { return !/^\d+$/.test(k); }).forEach(function (k) { parts.push((isIdent(k) ? k : "'" + k + "'") + ': ' + inspect(v[k], depth + 1, next)); });
    if (isArr && ctor && ctor !== 'Array') prefix = ctor + '(' + v.length + ') ';
  } else if (isMap) {
    prefix = 'Map(' + v.size + ') ';
    v.forEach(function (val, key) { parts.push(inspect(key, depth + 1, next) + ' => ' + inspect(val, depth + 1, next)); });
  } else if (isSet) {
    prefix = 'Set(' + v.size + ') ';
    v.forEach(function (val) { parts.push(inspect(val, depth + 1, next)); });
  } else {
    if (ctor && ctor !== 'Object') prefix = ctor + ' ';
    else if (!ctor && Object.getPrototypeOf(v) === null) prefix = '[Object: null prototype] ';
    var keys = Object.keys(v);
    keys.slice(0, 100).forEach(function (k) {
      var d = Object.getOwnPropertyDescriptor(v, k);
      var shown = d && (d.get || d.set) ? (d.get && d.set ? '[Getter/Setter]' : d.get ? '[Getter]' : '[Setter]') : inspect(v[k], depth + 1, next);
      parts.push((isIdent(k) ? k : "'" + k + "'") + ': ' + shown);
    });
    if (keys.length > 100) parts.push('... ' + (keys.length - 100) + ' more properties');
    Object.getOwnPropertySymbols(v).forEach(function (s) { parts.push('[' + s.toString() + ']: ' + inspect(v[s], depth + 1, next)); });
  }
  if (!parts.length) return prefix + open + close;
  var one = prefix + open + ' ' + parts.join(', ') + ' ' + close;
  if (one.length <= 72 && one.indexOf('\n') < 0) return one;
  var pad = '  ';
  return prefix + open + '\n' + parts.map(function (p) { return pad + p.replace(/\n/g, '\n' + pad); }).join(',\n') + '\n' + close;
}

function show(args) {
  return args.map(function (a) { return typeof a === 'string' ? a : inspect(a, 0, [], false); }).join(' ');
}

function table(data) {
  if (data === null || typeof data !== 'object') return inspect(data, 0, [], true);
  var rows = [], cols = [], hasValues = false;
  var entries = data instanceof Map ? Array.from(data.entries()) : Object.keys(data).map(function (k) { return [k, data[k]]; });
  entries.forEach(function (e) {
    var row = { __idx: String(e[0]) };
    var val = e[1];
    if (val !== null && typeof val === 'object') {
      Object.keys(val).forEach(function (c) { if (cols.indexOf(c) < 0) cols.push(c); row[c] = inspect(val[c], 1, [], false); });
    } else { hasValues = true; row.__val = inspect(val, 1, [], false); }
    rows.push(row);
  });
  var heads = ['(index)'].concat(cols).concat(hasValues ? ['Values'] : []);
  var keys = ['__idx'].concat(cols).concat(hasValues ? ['__val'] : []);
  var widths = heads.map(function (h, i) { return Math.max(h.length, Math.max.apply(null, rows.map(function (r) { return (r[keys[i]] || '').length; }).concat([0]))); });
  var cell = function (s, i) { s = s || ''; var gap = widths[i] - s.length; var l = Math.floor(gap / 2); return ' ' + ' '.repeat(l) + s + ' '.repeat(gap - l) + ' '; };
  var line = function (l, m, r) { return l + widths.map(function (w) { return '─'.repeat(w + 2); }).join(m) + r; };
  var out = [line('┌', '┬', '┐'), '│' + heads.map(cell).join('│') + '│', line('├', '┼', '┤')];
  rows.forEach(function (r) { out.push('│' + keys.map(function (k, i) { return cell(r[k], i); }).join('│') + '│'); });
  out.push(line('└', '┴', '┘'));
  return out.join('\n');
}

// Where an error happened in the learner's code: the function body starts on line 3 of
// the compiled text ("(async function anonymous(args\n) {\n").
var LINE_OFFSET = 2;
function lineOf(err) {
  var m = err && err.stack && /<anonymous>:(\d+):(\d+)/.exec(String(err.stack));
  return m ? Number(m[1]) - LINE_OFFSET : null;
}

function compile(params, body) { return new AsyncFunction(params, body); }
var PARAMS = ['console', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', '__logs'];

// The first line n for which the first n lines already fail with the same message.
function syntaxLine(lines, message) {
  for (var n = 1; n <= lines.length; n++) {
    try { compile(PARAMS, lines.slice(0, n).join('\n')); }
    catch (e) { if (e && e.message === message) return n; }
  }
  return null;
}

var STATEMENT_START = /^\s*(function|class|async\s+function|const|let|var|if|for|while|do|return|throw|try|switch|import|export|break|continue|\}|\)|\])/;

// Split off a trailing expression so its value can be shown ("2 + 3" on the last line).
function splitLast(code) {
  var lines = code.split('\n');
  var end = lines.length;
  while (end > 0 && (!lines[end - 1].trim() || /^\s*\/\//.test(lines[end - 1]))) end--;
  for (var k = end - 1; k >= 0 && k >= end - 40; k--) {
    var tail = lines.slice(k, end).join('\n').replace(/[;\s]+$/, '');
    if (!tail.trim() || STATEMENT_START.test(tail)) continue;
    try { compile(PARAMS, 'return (\n' + tail + '\n)'); } catch (e) { continue; }
    var prefix = lines.slice(0, k);
    try { compile(PARAMS, prefix.join('\n')); } catch (e) { continue; }
    return { prefix: prefix, tail: tail.split('\n'), rest: lines.slice(end) };
  }
  return null;
}

// The text that is compiled: the code (its lines unchanged), the value of its last
// expression, then the checks, which run in the same scope.
function buildProgram(code, checks) {
  var src = 'var __kc_last; ';
  var split = splitLast(code);
  if (split) {
    var body = split.prefix.slice();
    body.push(';__kc_last = (' + split.tail[0]);
    for (var i = 1; i < split.tail.length; i++) body.push(split.tail[i]);
    body.push(');');
    src += body.join('\n') + '\n' + split.rest.join('\n');
  } else {
    src += code;
  }
  src += '\n;var __kc_checks = [];\n';
  (checks || []).forEach(function (c) {
    src += '__kc_checks.push(await (async function () { var __label = ' + JSON.stringify(c.label) + '; try { var __r = await (async function () { return (\n' + c.test +
      '\n); })(); if (__r === true || (__r && typeof __r !== "string")) return { label: __label, ok: true, detail: "" };' +
      ' return { label: __label, ok: false, detail: typeof __r === "string" ? __r : "" }; } catch (__e) { return { label: __label, ok: false, detail: (__e && __e.name ? __e.name + ": " : "") + (__e && __e.message ? __e.message : String(__e)) }; } })());\n';
  });
  src += 'return { last: __kc_last, checks: __kc_checks };';
  return src;
}

function describe(err, lines, compiling) {
  var name = err && err.name ? err.name : 'Error';
  var message = err && err.message !== undefined ? String(err.message) : String(err);
  var line = compiling ? null : lineOf(err);
  if (line === null && name === 'SyntaxError' && lines) line = syntaxLine(lines, message);
  return { name: name, message: message, line: line };
}

self.onmessage = async function (e) {
  var data = e.data || {};
  var code = String(data.code || '');
  var post = function (m) { self.postMessage(m); };
  var indent = '';
  var logs = [];
  var MAX_LINES = 5000, lines_out = 0;
  var level = function (lv) {
    return function () {
      if (++lines_out > MAX_LINES) {
        if (lines_out === MAX_LINES + 1) post({ type: 'log', level: 'warn', text: '(more than ' + MAX_LINES + ' lines logged: the rest is not shown)' });
        return;
      }
      var text = show(Array.prototype.slice.call(arguments));
      text = indent ? text.split('\n').map(function (l) { return indent + l; }).join('\n') : text;
      logs.push(text);
      post({ type: 'log', level: lv, text: text });
    };
  };
  var counts = {}, timers = {};
  var con = {
    log: level('log'), info: level('info'), debug: level('log'), warn: level('warn'), error: level('error'), trace: level('log'),
    dir: function (v) { level('log')(inspect(v, 0, [], true)); },
    table: function (d) { level('log')(table(d)); },
    group: function () { if (arguments.length) level('log')(...arguments); indent += '  '; },
    groupEnd: function () { indent = indent.slice(0, -2); },
    assert: function (c) { if (!c) { var rest = Array.prototype.slice.call(arguments, 1); level('error')('Assertion failed' + (rest.length ? ': ' + show(rest) : '')); } },
    count: function (l) { l = l === undefined ? 'default' : String(l); counts[l] = (counts[l] || 0) + 1; level('log')(l + ': ' + counts[l]); },
    countReset: function (l) { counts[l === undefined ? 'default' : String(l)] = 0; },
    time: function (l) { timers[l === undefined ? 'default' : String(l)] = Date.now(); },
    timeEnd: function (l) { l = l === undefined ? 'default' : String(l); if (l in timers) { level('log')(l + ': ' + (Date.now() - timers[l]) + 'ms'); delete timers[l]; } },
    timeLog: function (l) { l = l === undefined ? 'default' : String(l); if (l in timers) level('log')(l + ': ' + (Date.now() - timers[l]) + 'ms'); },
  };

  // Timers are counted, so the run waits for them before it is done.
  var pending = new Set();
  var uncaught = function (err) { level('error')('Uncaught ' + (err && err.name ? err.name + ': ' + err.message : String(err))); };
  var wrapTimer = function (real, repeat) {
    return function (fn, ms) {
      var extra = Array.prototype.slice.call(arguments, 2);
      var id = real(function () {
        if (!repeat) pending.delete(id);
        try { var r = typeof fn === 'function' ? fn.apply(null, extra) : undefined; if (r && typeof r.catch === 'function') r.catch(uncaught); } catch (err) { uncaught(err); }
      }, ms);
      pending.add(id);
      return id;
    };
  };
  var mySetTimeout = wrapTimer(realSetTimeout, false);
  var mySetInterval = wrapTimer(realSetInterval, true);
  var myClearTimeout = function (id) { pending.delete(id); realClearTimeout(id); };
  var myClearInterval = function (id) { pending.delete(id); realClearInterval(id); };
  self.onunhandledrejection = function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); uncaught(ev && ev.reason); };

  var program = buildProgram(code, data.checks);
  var lines = code.split('\n');
  var fn;
  try {
    fn = compile(PARAMS, program);
  } catch (err) {
    post({ type: 'done', ok: false, error: describe(err, lines, true) });
    return;
  }
  try {
    var r = await fn(con, mySetTimeout, mySetInterval, myClearTimeout, myClearInterval, logs);
    while (pending.size) await new Promise(function (res) { realSetTimeout(res, 10); });
    post({
      type: 'done', ok: true,
      value: r && r.last !== undefined ? inspect(r.last, 0, [], false) : undefined,
      checks: r && r.checks,
    });
  } catch (err) {
    post({ type: 'done', ok: false, error: describe(err, lines), pending: pending.size });
  }
};
`,q=(e,t={})=>({ok:!1,value:null,error:{name:`Error`,message:e,line:null},checks:null,timedOut:!1,stopped:!1,...t});function ct(e,t={}){let n=null,r=null,i,a=()=>{},o=!1,s=new Promise(e=>{a=e}),c=e=>{o||(o=!0,clearTimeout(i),n?.terminate(),r&&URL.revokeObjectURL(r),a(e))};try{r=URL.createObjectURL(new Blob([st],{type:`text/javascript`})),n=new Worker(r)}catch(e){return c(q(`JavaScript could not start: ${e instanceof Error?e.message:String(e)}`)),{promise:s,stop(){}}}let l=t.timeoutMs??5e3;return i=setTimeout(()=>c({...q(`The code ran for more than ${l/1e3} seconds and was stopped. Is there a loop that never ends?`),timedOut:!0}),l),n.onmessage=e=>{let n=e.data;if(n.type===`log`)t.onLog?.(n.level,String(n.text));else if(n.type===`done`){let e=n.error;c({ok:n.ok===!0,value:typeof n.value==`string`?n.value:null,error:e?{name:e.name,message:e.message,line:e.line??null}:null,checks:Array.isArray(n.checks)?n.checks:null,timedOut:!1,stopped:!1})}},n.onerror=e=>{e.preventDefault(),c(q(e.message||`The code stopped unexpectedly.`))},n.postMessage({code:e,checks:t.checks??[]}),{promise:s,stop:()=>c({...q(`Stopped.`),error:null,stopped:!0})}}var lt=class{kernel=null;js=null;stopped=!1;listeners=new Set;running=!1;onRunning(e){return this.listeners.add(e),()=>this.listeners.delete(e)}setRunning(e){this.running=e;for(let t of[...this.listeners])t(e)}async run(e){this.stopped=!1,this.setRunning(!0);let t=performance.now(),n;try{n=e.language===`python`?await this.runPython(e):await this.runJavaScript(e)}finally{this.setRunning(!1)}return n.ms=performance.now()-t,e.checks?.length&&n.ok&&!n.checks&&(n.error={name:`Checks`,message:`The checks could not run. Did the code end early (a return or exit at the top level)?`,line:null}),n}stop(){this.running&&(this.stopped=!0,this.js?.stop(),this.kernel&&this.kernel.status!==`off`&&this.kernel.restart().catch(()=>{}))}async restartPython(){this.kernel&&await this.kernel.restart()}dispose(){this.js?.stop(),this.kernel?.dispose(),this.kernel=null,this.listeners.clear()}async runJavaScript(e){let t=G(`javascript`);this.js=ct(e.code,{checks:e.checks,onLog:(t,n)=>e.onSeg?.({kind:t===`error`?`err`:t===`warn`?`warn`:`out`,text:n+`
`})});let n=await this.js.promise;return this.js=null,t.ok=n.ok,t.value=n.value,t.error=n.timedOut?null:n.error,t.checks=n.checks,t.timedOut=n.timedOut,t.stopped=n.stopped||this.stopped,t}async runPython(e){let t=G(`python`),n=this.kernel??=new he(`kcode`),r=t=>n=>e.onSeg?.({kind:t,text:n}),i=``;try{n.status===`off`&&e.onSeg?.({kind:`status`,text:`Starting Python (the first time takes a few seconds)…
`}),await n.resetNamespace(),De(e.code)&&await n.runCell(Oe(e.answers??[]));let a=await n.runCell(e.code,{onStdout:e=>{i+=e,r(`out`)(e)},onStderr:r(`err`),onStatus:e=>r(`status`)(e+`
`)});if(t.figures=a.figures,t.value=a.result,!a.ok&&a.error)return t.error={name:a.error.type,message:a.error.message,line:Ee(a.error.traceback),traceback:a.error.traceback},t;if(t.ok=!0,e.checks?.length){let r=``;await n.runCell(Ce(e.checks,i),{onStdout:e=>{r+=e}}),t.checks=we(r)}}catch(e){this.stopped?t.stopped=!0:t.error={name:`Error`,message:e instanceof Error?e.message:String(e),line:null},t.ok=!1}return t.stopped=t.stopped||this.stopped,t}},ut={beginner:`Beginner`,intermediate:`Intermediate`,advanced:`Advanced`},J=new Map,dt=e=>{let t=J.get(e.id);return t===void 0&&(t=Be(I(e.text))+` `+(e.task??``),J.set(e.id,t)),t};function ft({lesson:e,current:t,done:n,onOpen:r,hint:i}){return(0,w.jsxs)(`button`,{className:`kcd-item${t?` on`:``}${n?` done`:``}`,onClick:()=>r(e.id),title:`${e.title} — ${ut[e.level]}, about ${e.minutes} min${n?`, completed`:``}`,"aria-current":t?`true`:void 0,children:[(0,w.jsx)(`span`,{className:`kcd-tick`,"aria-label":n?`Completed`:`Not completed`,children:n?(0,w.jsx)(u,{size:14}):(0,w.jsx)(d,{size:14})}),(0,w.jsx)(`span`,{className:`kcd-item-title`,children:e.title}),i&&(0,w.jsx)(`span`,{className:`kcd-item-hint`,children:i}),(0,w.jsx)(`span`,{className:`kcd-lvl ${e.level}`,"aria-hidden":`true`,title:ut[e.level]})]})}function pt({current:e,done:t,query:n,onQuery:a,folded:o,onToggleFold:s,onOpen:c,streak:l}){let u=N.length,d=N.filter(e=>t.has(e.id)).length,f=(0,x.useMemo)(()=>n.trim()?Re(n,dt):null,[n]);return(0,w.jsxs)(`aside`,{className:`kcd-side`,"aria-label":`Lessons`,children:[(0,w.jsxs)(`div`,{className:`kcd-search`,children:[(0,w.jsx)(m,{size:13}),(0,w.jsx)(`input`,{className:`k-input`,value:n,placeholder:`Search lessons`,"aria-label":`Search lessons`,onChange:e=>a(e.target.value)}),n&&(0,w.jsx)(`button`,{className:`k-icon-btn`,"aria-label":`Clear the search`,onClick:()=>a(``),children:(0,w.jsx)(i,{size:13})})]}),(0,w.jsxs)(`div`,{className:`kcd-overall`,title:`${d} of ${u} lessons completed`,children:[(0,w.jsx)(`div`,{className:`kcd-progress`,role:`progressbar`,"aria-valuemin":0,"aria-valuemax":u,"aria-valuenow":d,"aria-label":`Progress`,children:(0,w.jsx)(`div`,{style:{width:`${d/u*100}%`}})}),(0,w.jsxs)(`span`,{children:[d,` / `,u,` done`]}),l.current>0&&(0,w.jsxs)(`span`,{className:`kcd-streak`,title:`Best streak: ${l.best} days`,children:[(0,w.jsx)(y,{size:12}),` `,l.current,` day`,l.current>1?`s`:``]})]}),(0,w.jsx)(`div`,{className:`kcd-tree`,children:f?f.length?f.map(n=>{let r=Ie(n.id);return(0,w.jsx)(ft,{lesson:n,current:n.id===e,done:t.has(n.id),onOpen:c,hint:r.course.title},n.id)}):(0,w.jsxs)(`p`,{className:`kcd-empty`,children:[`No lesson matches “`,n,`”.`]}):Pe.map(n=>{let i=n.chapters.flatMap(e=>e.lessons),a=i.filter(e=>t.has(e.id)).length,l=!o.includes(n.id);return(0,w.jsxs)(`div`,{className:`kcd-course`,children:[(0,w.jsxs)(`button`,{className:`kcd-course-head`,onClick:()=>s(n.id),"aria-expanded":l,title:n.blurb,children:[l?(0,w.jsx)(ee,{size:13}):(0,w.jsx)(r,{size:13}),(0,w.jsx)(`span`,{className:`kcd-course-title`,children:n.title}),(0,w.jsxs)(`span`,{className:`kcd-count`,children:[a,`/`,i.length]})]}),(0,w.jsx)(`div`,{className:`kcd-progress thin`,"aria-hidden":`true`,children:(0,w.jsx)(`div`,{style:{width:`${a/i.length*100}%`}})}),l&&n.chapters.map(n=>(0,w.jsxs)(`div`,{className:`kcd-chapter`,children:[(0,w.jsx)(`div`,{className:`kcd-chapter-title`,children:n.title}),n.lessons.map(n=>(0,w.jsx)(ft,{lesson:n,current:n.id===e,done:t.has(n.id),onOpen:c},n.id))]},n.id))]},n.id)})})]})}var Y=typeof navigator<`u`&&/Mac|iPhone|iPad/.test(navigator.userAgent),X=Y?`⌘`:`Ctrl+`,mt=Y?`⇧⌘`:`Ctrl+Shift+`,Z=Y?`⌥⌘`:`Ctrl+Alt+`,ht={python:`# The scratchpad: any Python you like. Run it with Ctrl/Cmd+Enter.
print("Hello from the scratchpad")
`,javascript:`// The scratchpad: any JavaScript you like. Run it with Ctrl/Cmd+Enter.
console.log("Hello from the scratchpad");
`},gt=e=>/\.(m?js|cjs)$/i.test(e)?`javascript`:`python`;function Q({win:e,args:t}){let r=(0,x.useMemo)(()=>{try{return window.localStorage}catch{return null}},[]),i=(0,x.useMemo)(()=>new tt(r),[r]),c=(0,x.useMemo)(()=>new lt,[]),[,ee]=(0,x.useState)(0),u=(0,x.useCallback)(()=>ee(e=>e+1),[]),[d,f]=(0,x.useState)(()=>nt(r)),te=(0,x.useRef)(d);te.current=d;let p=(0,x.useCallback)(e=>{let t={...te.current,...e};te.current=t,f(t),rt(r,t)},[r]),m=(0,x.useRef)(new Map),pe=(0,x.useRef)(void 0),h=(0,x.useCallback)(()=>{clearTimeout(pe.current);for(let e of m.current.values())e();m.current.clear()},[]),he=(0,x.useCallback)((e,t)=>{m.current.set(e,t),clearTimeout(pe.current),pe.current=setTimeout(h,500)},[h]),[g,ge]=(0,x.useState)(typeof t.path==`string`?`scratch`:`lessons`),[_e,_]=(0,x.useState)(()=>(typeof t.lesson==`string`&&Fe(t.lesson)?t.lesson:null)??(i.data.last&&Fe(i.data.last)?i.data.last:N[0].id)),v=Fe(_e)??N[0],y=Ie(v.id),[ye,b]=(0,x.useState)(()=>({...i.data.code})),[S,C]=(0,x.useState)(()=>({lang:i.data.scratch.language,python:i.data.scratch.python||ht.python,javascript:i.data.scratch.javascript||ht.javascript,path:null,saved:null})),[Ce,we]=(0,x.useState)(``),[Ee,Oe]=(0,x.useState)({}),[Ae,je]=(0,x.useState)({}),[T,E]=(0,x.useState)(`lesson`),[D,O]=(0,x.useState)(null),k=ye[v.id]??v.code,A=S[S.lang],Ne=g===`lessons`?k:A,j=g===`lessons`?v.language:S.lang,M=S.path!==null&&A!==S.saved,P=(0,x.useRef)(null),ze=(0,x.useRef)(null),F=(0,x.useRef)(null),I=(0,x.useRef)(null),[L,Be]=(0,x.useState)(!1);(0,x.useLayoutEffect)(()=>{let e=P.current;if(!e)return;let t=()=>Be(e.clientWidth<760);t();let n=new ResizeObserver(t);return n.observe(e),()=>n.disconnect()},[]);let R=(D??(d.sidebar&&!L))&&g===`lessons`,Ve=()=>{O(!R),L||p({sidebar:!R})},[z,He]=(0,x.useState)(!1);(0,x.useEffect)(()=>c.onRunning(He),[c]);let B=(0,x.useRef)([]),V=(0,x.useRef)(void 0),[We,Ke]=(0,x.useState)([]),[Je,Ye]=(0,x.useState)([]),[Xe,H]=(0,x.useState)(null),[Ze,Qe]=(0,x.useState)(0),[$e,et]=(0,x.useState)(``),U=(0,x.useRef)(0),W=(0,x.useCallback)(()=>{U.current++,B.current=[],clearTimeout(V.current),V.current=void 0,Ke([]),Ye([]),H(null),I.current&&Me(I.current,null)},[]),G=(0,x.useCallback)(async(e,t,n,r)=>{W();let a=U.current;Qe(e=>e+1);let o=await c.run({language:t,code:e,checks:r?n?.checks:void 0,answers:$e?$e.replace(/\n$/,``).split(`
`):[],onSeg:e=>{U.current===a&&it(B.current,e)&&V.current===void 0&&(V.current=setTimeout(()=>{V.current=void 0,Ke([...B.current])},40))}});clearTimeout(V.current),V.current=void 0;let s=U.current===a;return s&&(o.segs=[...B.current]),i.touch(),n&&o.ok&&!o.stopped&&(n.checks?.length?r&&o.checks&&(je(t=>({...t,[n.id]:{results:o.checks,code:e}})),Te(o.checks).allPassed&&i.markDone(n.id)):i.markDone(n.id)),i.save(),s&&(Ke(o.segs),Ye(o.figures),H(o),o.error?.line&&I.current&&Me(I.current,o.error.line)),u(),o},[$e,u,W,c,i]),K=e=>{c.running||(g===`lessons`?(E(`code`),G(Ne,v.language,v,e&&!!v.checks?.length)):G(Ne,S.lang,null,!1))},at=(0,x.useCallback)(e=>{e!==g&&(h(),ge(e),W())},[W,h,g]),st=(0,x.useCallback)(e=>{Fe(e)&&(c.running&&c.stop(),h(),ge(`lessons`),_(e),i.setLast(e),W(),E(`lesson`),L&&O(!1))},[W,h,L,c,i]),q=e=>{let t=Le(v.id,e);t&&st(t.id)},ct=e=>{if(g===`lessons`){let t=v.id,n=v.code;b(r=>r[t]===e||r[t]===void 0&&e===n?r:{...r,[t]:e}),he(`code:${t}`,()=>i.setCode(t,e,n))}else{let t=S.lang;C(n=>n[t]===e?n:{...n,[t]:e}),he(`scratch`,()=>i.setScratch(t,e))}},ut=async()=>{g===`lessons`&&(k===v.code||await a.dialog.confirm(`Go back to the starter code of this lesson? Your changes to it will be lost.`,{title:`Reset the code`,okLabel:`Reset`,danger:!0}))&&(b(e=>{let{[v.id]:t,...n}=e;return n}),m.current.delete(`code:${v.id}`),i.setCode(v.id,v.code,v.code),je(e=>{let{[v.id]:t,...n}=e;return n}),W())},J=(e,t)=>Oe(n=>({...n,[v.id]:{...n[v.id],[e]:t}})),dt=async()=>{v.solution&&(k===v.code||k===v.solution||await a.dialog.confirm(`Replace your code with the solution?`,{title:`Use the solution`,okLabel:`Replace`,danger:!0}))&&(b(e=>({...e,[v.id]:v.solution})),he(`code:${v.id}`,()=>i.setCode(v.id,v.solution,v.code)))},ft=async()=>{if(!M)return!0;let e=await a.dialog.choose(`Save the changes to “${de(S.path)}” first?`,[{label:`Cancel`,value:`cancel`},{label:`Don’t Save`,value:`discard`,danger:!0},{label:`Save`,value:`save`,primary:!0}],{title:`Unsaved changes`});return e===`save`?Q(!1):e===`discard`},Y=(0,x.useCallback)(async t=>{if(!await ft())return;let n=t??await a.dialog.openFile({title:`Open script`,extensions:[`.py`,`.js`,`.mjs`]});if(n)try{let t=await a.fs.readText(n),r=gt(n);h(),C(e=>({...e,lang:r,[r]:t,path:n,saved:t})),ge(`scratch`),e.setDocumentPath(n),W()}catch(e){await a.dialog.alert(`“${de(n)}” could not be opened: ${e instanceof Error?e.message:String(e)}`)}},[W,h,e,M,S.path]),Q=async t=>{let n=S.path;if((!n||t)&&(n=await a.dialog.saveFile({title:`Save script`,defaultName:n?de(n):S.lang===`python`?`script.py`:`script.js`,extensions:S.lang===`python`?[`.py`]:[`.js`]}),!n))return!1;try{await a.fs.writeText(n,A,{mkdirs:!0});let t=A;return C(e=>({...e,path:n,saved:t})),e.setDocumentPath(n),!0}catch(e){return await a.dialog.alert(`The script could not be saved: ${e instanceof Error?e.message:String(e)}`),!1}},_t=async t=>{t!==S.lang&&(!S.path||await ft())&&(h(),C(e=>({...e,lang:t,path:null,saved:null})),i.setScratch(t,S[t]),e.setDocumentPath(null),W())},vt=(0,x.useRef)(null);(0,x.useEffect)(()=>{let e=vt.current;vt.current={path:t.path,lesson:t.lesson},typeof t.path==`string`&&(!e||t.path!==e.path)?Y(t.path):e&&typeof t.lesson==`string`&&t.lesson!==e.lesson&&st(t.lesson)},[t.path,t.lesson]);let yt=async()=>{if(g!==`lessons`){await a.dialog.alert(`Open a lesson first: kBook can take the lesson and your code from it.`);return}if(v.language!==`python`){await a.dialog.alert(`kBook notebooks run Python, so only the Python lessons can be opened there.`);return}try{let e=`${fe}/Documents/kCode Lessons`,t=`${e}/${a.fs.uniqueName(e,`${v.id}.kbook`)}`;await a.fs.writeText(t,JSON.stringify(Ge(v,k),null,1),{mkdirs:!0}),a.open(`khervebook`,{path:t})}catch(e){await a.dialog.alert(`The notebook could not be made: ${e instanceof Error?e.message:String(e)}`)}},bt=async()=>{await a.dialog.confirm(`Forget the lessons you completed, the code you wrote in them, your scratchpad draft and your streak?`,{title:`Reset progress`,okLabel:`Reset progress`,danger:!0})&&(m.current.clear(),i.reset(),b({}),je({}),Oe({}),W(),u())},$=i.doneIds(),xt=i.streak();(0,x.useEffect)(()=>{e.setTitle(g===`lessons`?`kCode — ${v.title}`:`kCode — ${S.path?de(S.path):`Scratchpad`}${M?` •`:``}`)},[e,g,v.title,S.path,M]);let St=(0,x.useRef)({dirty:M,path:S.path,saveScript:Q});St.current={dirty:M,path:S.path,saveScript:Q},(0,x.useEffect)(()=>(e.setCloseGuard(async()=>{h();let e=St.current;if(!e.dirty)return!0;let t=await a.dialog.choose(`Save the changes to “${de(e.path)}” before closing?`,[{label:`Cancel`,value:`cancel`},{label:`Don’t Save`,value:`discard`,danger:!0},{label:`Save`,value:`save`,primary:!0}],{title:`Unsaved changes`});return t===`save`?e.saveScript(!1):t===`discard`}),()=>e.setCloseGuard(null)),[e,h]),(0,x.useEffect)(()=>()=>{h(),c.dispose()},[h,c]);let Ct=e=>{let t=Ie(e.id);return{id:e.id,language:e.language,title:e.title,course:t.course.id,chapter:t.chapter.title,level:e.level,minutes:e.minutes,done:$.has(e.id),exercise:!!e.checks?.length}},wt=e=>({ok:e.ok,output:ot(e),...e.error&&{error:`${e.error.name}: ${e.error.message}${e.error.line?` (line ${e.error.line})`:``}`}}),Tt=async(e,t)=>{if(c.running)throw Error(`kCode is already running something. Wait for it to finish, or stop it.`);return g===`lessons`?(b(t=>({...t,[v.id]:e})),he(`code:${v.id}`,()=>i.setCode(v.id,e,v.code)),G(e,v.language,v,t)):(C(t=>({...t,[t.lang]:e})),G(e,S.lang,null,!1))};me(e,Se({lessons:({course:e,language:t,query:n})=>(n?Re(n):N).filter(n=>(!t||n.language===t)&&(!e||Ie(n.id).course.id===e)).map(Ct),open:e=>{if(!Fe(e))throw Error(`No lesson "${e}". Use kcode_lessons for the list.`);st(e)},run:async e=>wt(await Tt(e,!1)),language:()=>j,check:async()=>{if(g!==`lessons`)throw Error(`The scratchpad has no checks. Open a lesson first (kcode_open).`);let e=await Tt(k,!0);if(!v.checks?.length)return{...wt(e),lesson:v.id,passed:0,total:0,allPassed:!1,results:[],note:`This lesson has no automatic checks: it counts as done when its code runs without an error.`};let t=e.checks??[],n=Te(t);return{...wt(e),lesson:v.id,passed:n.passed,total:v.checks.length,allPassed:n.allPassed,results:t,...e.checks===null&&{note:e.error?`The code stopped with an error before the checks could run.`:`The checks could not run.`}}},hint:()=>{if(g!==`lessons`)throw Error(`The scratchpad has no hints. Open a lesson first (kcode_open).`);return v.hint&&Oe(e=>({...e,[v.id]:{...e[v.id],hint:!0}})),E(`lesson`),{lesson:v.id,hint:v.hint??null,task:v.task??null}},progress:()=>{let e=N.find(e=>!$.has(e.id));return{completed:$.size,total:N.length,percent:Math.round($.size/N.length*100),streak:xt,current:g===`lessons`?{id:v.id,title:v.title}:null,next:e?{id:e.id,title:e.title}:null,courses:Pe.map(e=>{let t=e.chapters.flatMap(e=>e.lessons);return{id:e.id,title:e.title,completed:t.filter(e=>$.has(e.id)).length,total:t.length}})}},setCode:e=>(ct(e),{lesson:g===`lessons`?v.id:null,language:j})}));let Et=g===`lessons`&&!!v.hint,Dt=g===`lessons`&&!!v.solution,Ot=[{label:`File`,items:[{label:`Open Script…`,icon:re,shortcut:`${X}O`,onClick:()=>void Y()},{label:`Save Script`,icon:le,shortcut:`${X}S`,disabled:g!==`scratch`,onClick:()=>void Q(!1)},{label:`Save Script As…`,shortcut:`${mt}S`,disabled:g!==`scratch`,onClick:()=>void Q(!0)},`-`,{label:`Open Lesson in kBook`,icon:o,disabled:g!==`lessons`||v.language!==`python`,onClick:()=>void yt()}]},{label:`Lesson`,items:[{label:`Run`,icon:se,shortcut:`${X}↩`,disabled:z,onClick:()=>K(!1)},{label:`Run & Check`,icon:ie,shortcut:`${mt}↩`,disabled:z||g!==`lessons`||!v.checks?.length,onClick:()=>K(!0)},{label:`Stop`,icon:ue,shortcut:`${X}.`,disabled:!z,onClick:()=>c.stop()},`-`,{label:`Show Hint`,icon:be,disabled:!Et,onClick:()=>{E(`lesson`),J(`hint`,!0)}},{label:`Show Solution`,icon:ne,disabled:!Dt,onClick:()=>{E(`lesson`),J(`solution`,!0)}},{label:`Reset Code`,icon:ce,disabled:g!==`lessons`,onClick:()=>void ut()},`-`,{label:`Next Lesson`,icon:l,shortcut:`${Z}→`,disabled:g===`lessons`&&!Le(v.id,1),onClick:()=>q(1)},{label:`Previous Lesson`,icon:n,shortcut:`${Z}←`,disabled:g===`lessons`&&!Le(v.id,-1),onClick:()=>q(-1)},`-`,{label:`Reset Progress…`,danger:!0,onClick:()=>void bt()}]},{label:`View`,items:[{label:`Lessons`,icon:s,checked:g===`lessons`,onClick:()=>at(`lessons`)},{label:`Scratchpad`,icon:oe,checked:g===`scratch`,onClick:()=>at(`scratch`)},`-`,{label:`Course List`,icon:ae,checked:R,shortcut:`${X}\\`,onClick:()=>Ve()},`-`,{label:`Larger Text`,disabled:d.font>=22,onClick:()=>p({font:d.font+1})},{label:`Smaller Text`,disabled:d.font<=10,onClick:()=>p({font:d.font-1})},{label:`Actual Size`,disabled:d.font===13,onClick:()=>p({font:13})},`-`,{label:`Clear Output`,onClick:W},{label:`Restart Python`,onClick:()=>{W(),c.restartPython()}}]},{label:`Help`,items:[{label:`About kCode`,onClick:()=>void a.dialog.alert(`kCode has ${N.length} lessons in ${Pe.length} courses: Python basics, Python for science, JavaScript basics and lab recipes. Each exercise is checked automatically; your progress and your code stay in this browser.`,{title:`About kCode`})},{label:`Keyboard Shortcuts`,onClick:()=>void a.dialog.alert(`${X}Enter runs the code.  ${mt}Enter runs it and checks the exercise.  ${X}. stops.\n${Z}Right / ${Z}Left: next / previous lesson.\n${X}O opens a script, ${X}S saves it (scratchpad).\nDrag the bars between the panes to resize them; with the keyboard, focus a bar and use the arrow keys.`,{title:`Keyboard shortcuts`})},{label:`What Can Python Do Here?`,onClick:()=>void a.dialog.alert(`Python runs inside your browser (Pyodide). numpy, scipy, pandas and matplotlib load when you import them; figures appear under the editor. Files you write go to your KherveOS home folder. input() cannot wait for a keystroke: kCode answers it from the “input() answers” box.`,{title:`Python in kCode`})}]}];(0,x.useEffect)(()=>{e.setMenus(Ot)}),(0,x.useEffect)(()=>()=>e.setMenus(null),[e]);let kt=e=>{if(e.defaultPrevented)return;let t=e.metaKey||e.ctrlKey,n=t=>{e.preventDefault(),t()};t&&e.key===`Enter`?n(()=>K(e.shiftKey)):t&&e.key===`.`?n(()=>c.stop()):t&&e.altKey&&e.key===`ArrowRight`&&g===`lessons`?n(()=>q(1)):t&&e.altKey&&e.key===`ArrowLeft`&&g===`lessons`?n(()=>q(-1)):t&&!e.shiftKey&&e.key.toLowerCase()===`o`?n(()=>void Y()):t&&e.key.toLowerCase()===`s`&&g===`scratch`?n(()=>void Q(e.shiftKey)):t&&e.key===`\\`&&n(()=>Ve())},At=[{key:`Mod-Enter`,run:()=>(K(!1),!0)},{key:`Mod-Shift-Enter`,run:()=>(K(!0),!0)}],jt=g===`lessons`&&Ae[v.id]?{results:Ae[v.id].results,stale:Ae[v.id].code!==k}:null,Mt=Ee[v.id]??{},Nt=g===`lessons`&&(!L||T===`lesson`),Pt=!L||g===`scratch`||T===`code`,Ft=Le(v.id,1),It=Nt&&Pt?d.split:+!!Nt;return(0,w.jsxs)(`div`,{className:`k-app kcd-app${L?` narrow`:``}`,ref:P,onKeyDown:kt,children:[(0,w.jsxs)(`div`,{className:`k-toolbar kcd-bar`,children:[g===`lessons`&&(0,w.jsx)(`button`,{className:`k-icon-btn`,title:R?`Hide the course list`:`Show the course list`,"aria-label":`Toggle the course list`,"aria-pressed":R,onClick:()=>Ve(),children:R?(0,w.jsx)(xe,{size:16}):(0,w.jsx)(ae,{size:16})}),(0,w.jsxs)(`div`,{className:`kcd-seg-ctl`,role:`tablist`,"aria-label":`Mode`,children:[(0,w.jsxs)(`button`,{role:`tab`,"aria-selected":g===`lessons`,className:g===`lessons`?`on`:``,onClick:()=>at(`lessons`),children:[(0,w.jsx)(s,{size:13}),` `,(0,w.jsx)(`span`,{className:`lbl`,children:`Lessons`})]}),(0,w.jsxs)(`button`,{role:`tab`,"aria-selected":g===`scratch`,className:g===`scratch`?`on`:``,onClick:()=>at(`scratch`),children:[(0,w.jsx)(oe,{size:13}),` `,(0,w.jsx)(`span`,{className:`lbl`,children:`Scratchpad`})]})]}),(0,w.jsx)(`span`,{className:`k-sep`}),z?(0,w.jsxs)(`button`,{className:`k-btn small danger`,onClick:()=>c.stop(),title:`Stop (${X}.)`,children:[(0,w.jsx)(ue,{size:12}),` Stop`]}):(0,w.jsxs)(`button`,{className:`k-btn small primary`,onClick:()=>K(!1),title:`Run (${X}Enter)`,children:[(0,w.jsx)(se,{size:12}),` Run`]}),g===`lessons`&&v.checks?.length?(0,w.jsxs)(`button`,{className:`k-btn small`,disabled:z,onClick:()=>K(!0),title:`Run and check the exercise (${mt}Enter)`,children:[(0,w.jsx)(ie,{size:13}),` `,(0,w.jsx)(`span`,{className:`lbl`,children:`Run & check`})]}):null,g===`lessons`?(0,w.jsxs)(w.Fragment,{children:[(0,w.jsxs)(`button`,{className:`k-btn small`,disabled:!Et,onClick:()=>{E(`lesson`),J(`hint`,!Mt.hint)},title:`Hint`,children:[(0,w.jsx)(be,{size:13}),` `,(0,w.jsx)(`span`,{className:`lbl`,children:`Hint`})]}),(0,w.jsxs)(`button`,{className:`k-btn small`,disabled:!Dt,onClick:()=>{E(`lesson`),J(`solution`,!Mt.solution)},title:`Solution`,children:[(0,w.jsx)(ne,{size:13}),` `,(0,w.jsx)(`span`,{className:`lbl`,children:`Solution`})]}),(0,w.jsxs)(`button`,{className:`k-btn small`,onClick:()=>void ut(),title:`Back to the starter code`,children:[(0,w.jsx)(ce,{size:13}),` `,(0,w.jsx)(`span`,{className:`lbl`,children:`Reset`})]}),(0,w.jsxs)(`button`,{className:`k-btn small`,onClick:()=>void yt(),disabled:v.language!==`python`,title:`Open this lesson as a kBook notebook`,children:[(0,w.jsx)(o,{size:13}),` `,(0,w.jsx)(`span`,{className:`lbl`,children:`Open in kBook`})]})]}):(0,w.jsxs)(w.Fragment,{children:[(0,w.jsxs)(`button`,{className:`k-btn small`,onClick:()=>void Y(),title:`Open a script (${X}O)`,children:[(0,w.jsx)(re,{size:13}),` `,(0,w.jsx)(`span`,{className:`lbl`,children:`Open…`})]}),(0,w.jsxs)(`button`,{className:`k-btn small`,onClick:()=>void Q(!1),title:`Save (${X}S)`,children:[(0,w.jsx)(le,{size:13}),` `,(0,w.jsx)(`span`,{className:`lbl`,children:`Save`})]}),(0,w.jsxs)(`button`,{className:`k-btn small`,onClick:()=>void Q(!0),title:`Save as…`,children:[(0,w.jsx)(`span`,{className:`lbl`,children:`Save As…`}),(0,w.jsx)(`span`,{className:`short`,children:`As…`})]}),(0,w.jsxs)(`select`,{className:`k-input kcd-lang`,"aria-label":`Language`,value:S.lang,onChange:e=>void _t(e.target.value),children:[(0,w.jsx)(`option`,{value:`python`,children:`Python`}),(0,w.jsx)(`option`,{value:`javascript`,children:`JavaScript`})]})]}),(0,w.jsx)(`span`,{className:`k-spacer`}),g===`lessons`&&(0,w.jsxs)(w.Fragment,{children:[(0,w.jsx)(`button`,{className:`k-icon-btn`,disabled:!Le(v.id,-1),onClick:()=>q(-1),title:`Previous lesson (${Z}←)`,"aria-label":`Previous lesson`,children:(0,w.jsx)(n,{size:16})}),(0,w.jsx)(`button`,{className:`k-icon-btn`,disabled:!Ft,onClick:()=>q(1),title:`Next lesson (${Z}→)`,"aria-label":`Next lesson`,children:(0,w.jsx)(l,{size:16})})]})]}),L&&g===`lessons`&&(0,w.jsxs)(`div`,{className:`kcd-tabs`,role:`tablist`,"aria-label":`Lesson or code`,children:[(0,w.jsx)(`button`,{role:`tab`,"aria-selected":T===`lesson`,className:T===`lesson`?`on`:``,onClick:()=>E(`lesson`),children:`Lesson`}),(0,w.jsx)(`button`,{role:`tab`,"aria-selected":T===`code`,className:T===`code`?`on`:``,onClick:()=>E(`code`),children:`Code & output`})]}),(0,w.jsxs)(`div`,{className:`kcd-body`,children:[R&&(0,w.jsx)(pt,{current:v.id,done:$,query:Ce,onQuery:we,folded:d.folded,onToggleFold:e=>p({folded:d.folded.includes(e)?d.folded.filter(t=>t!==e):[...d.folded,e]}),onOpen:st,streak:xt}),(0,w.jsxs)(`div`,{className:`kcd-work`,ref:ze,style:{gridTemplateColumns:Nt&&Pt?`minmax(0, ${It}fr) 7px minmax(0, ${1-It}fr)`:`minmax(0, 1fr)`},children:[Nt&&(0,w.jsx)(Ue,{lesson:v,course:y.course,chapter:y.chapter,done:$.has(v.id),hintShown:!!Mt.hint,solutionShown:!!Mt.solution,onHint:()=>J(`hint`,!0),onSolution:()=>J(`solution`,!0),onClose:e=>J(e,!1),onUseSolution:()=>void dt(),checkView:jt,next:Ft,onNext:()=>q(1),fontSize:d.font}),Nt&&Pt&&(0,w.jsx)(ke,{dir:`col`,container:ze,share:d.split,onChange:e=>p({split:e}),min:.2,max:.7,label:`Resize the lesson text`}),Pt&&(0,w.jsxs)(`div`,{className:`kcd-right`,ref:F,style:{gridTemplateRows:`minmax(80px, ${d.editorShare}fr) 7px minmax(80px, ${1-d.editorShare}fr)`},children:[(0,w.jsx)(`div`,{className:`kcd-editor`,children:(0,w.jsx)(ve,{value:Ne,language:j,onChange:ct,lineNumbers:!0,fontSize:d.font,keys:At,onReady:e=>{I.current=e}})}),(0,w.jsx)(ke,{dir:`row`,container:F,share:d.editorShare,onChange:e=>p({editorShare:e}),min:.2,max:.85,label:`Resize the editor`}),(0,w.jsx)(qe,{running:z,segs:We,figures:Je,report:Xe,runNo:Ze,onJump:e=>I.current&&Me(I.current,e,!0),onClear:W,showInput:j===`python`&&De(Ne),answers:$e,onAnswers:et,fontSize:d.font})]})]})]}),(0,w.jsxs)(`div`,{className:`k-statusbar kcd-status`,children:[(0,w.jsx)(`span`,{className:`kcd-where`,children:g===`lessons`?`${y.course.title} › ${y.chapter.title} › ${v.title}`:S.path?`${S.path}${M?` (unsaved changes)`:``}`:`Scratchpad — ${S.lang===`python`?`Python`:`JavaScript`}`}),(0,w.jsx)(`span`,{className:`k-spacer`}),(0,w.jsxs)(`span`,{children:[$.size,`/`,N.length,` lessons`]}),xt.current>0&&(0,w.jsxs)(`span`,{children:[xt.current,`-day streak`]}),(0,w.jsx)(`span`,{children:z?`Running…`:j===`python`?`Python`:`JavaScript`})]})]})}export{Q as default};