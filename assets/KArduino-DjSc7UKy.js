import{a as e}from"./rolldown-runtime-B0Z9INg1.js";import{i as t}from"./react-CgaLaEa2.js";import{H as n,M as r,P as i,T as a,V as o,b as s,j as c,t as l,w as u}from"./os-BJ9KzKzu.js";import{X as d,rt as f,z as p}from"./windows-CKckRiNU.js";import{t as m}from"./cable-BCNAoPx6.js";import{t as h}from"./chevron-down-CHwrzjDZ.js";import{t as g}from"./circle-x-BxiuwRw3.js";import{t as ee}from"./clipboard-CqZeeStl.js";import{t as te}from"./folder-open-mufV3GwK.js";import{t as ne}from"./pause-n9BpRVFq.js";import{t as re}from"./play-BTSnp6r3.js";import{t as ie}from"./save-CoU2Aey2.js";import{t as _}from"./send-1D1BUmzj.js";import{t as v}from"./jsx-runtime-B74pBk57.js";import{c as ae,i as oe,n as se,r as ce,t as y}from"./path-CtZiOU3c.js";import{$ as le,X as b,Y as ue,ft as de,rt as fe}from"./index-q8vE3-85.js";import{a as pe}from"./appTools-CjkVCyo5.js";import{Ct as me,G as x,K as he,Q as ge,St as _e,U as S,bt as ve,c as C,yt as ye}from"./dist-D7HjTpXA.js";import{t as be}from"./CodeEditor-mPefb8gm.js";var w={name:`plug`,size:24,node:[[`path`,{d:`M12 22v-5`,key:`1ega77`}],[`path`,{d:`M15 8V2`,key:`18g5xt`}],[`path`,{d:`M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z`,key:`1xoxul`}],[`path`,{d:`M9 8V2`,key:`14iosj`}]]};w.node;var xe=f(w),Se={name:`unplug`,size:24,node:[[`path`,{d:`m19 5 3-3`,key:`yk6iyv`}],[`path`,{d:`m2 22 3-3`,key:`19mgm9`}],[`path`,{d:`M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z`,key:`goz73y`}],[`path`,{d:`M7.5 13.5 10 11`,key:`7xgeeb`}],[`path`,{d:`M10.5 16.5 13 14`,key:`10btkg`}],[`path`,{d:`m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z`,key:`1snsnr`}]]};Se.node;var Ce=f(Se),T=e(t(),1),E=e=>({ok:e.ok,cli:e.cli,output:e.output.length>6e3?`${e.output.slice(0,6e3)}\n… (cut)`:e.output,diagnostics:e.diagnostics.filter(e=>!e.external).slice(0,30),size:e.size});function we(e){return{get_sketch:async()=>{let t=e.get();return{name:`${t.name}.ino`,board:t.board,code:t.code,files:t.files}},set_sketch:async t=>{let n=String(t.code??``);if(!n.trim())throw Error(`Give the sketch code.`);return e.setCode(n),{shown:!0,note:`Shown in kArduino: call kArduino compile to check it.`}},compile:async()=>E(await e.compile()),save:async()=>({saved:await e.save()}),serial_read:async t=>{let n=e.get(),r=Math.min(200,Math.max(1,Number(t.lines??20)));return{connected:n.open,lines:n.lines.slice(-r)}},serial_send:async(t,n)=>{let r=String(t.text??``);if(!e.get().open)throw Error(`The serial monitor is not connected: the user has to connect it first.`);return await n.confirm(`send a line to the board`,r)?(await e.send(r),{sent:!0}):{sent:!1}},load_example:async(t,n)=>{let r=String(t.id??``).trim();return r?e.get().dirty&&!await n.confirm(`replace the open sketch with an example`,r)?{loaded:!1}:e.loadExample(r):{examples:e.examples()}},upload:async(t,n)=>{let r=e.get();if(!await n.confirm(`upload the sketch to a board plugged into the KherveOS server's computer`,r.board))return{uploaded:!1,note:`The user declined.`};let i=await e.upload();return{...E(i),uploaded:!!i.uploaded,port:i.port}},set_board:async t=>({board:e.setBoard(String(t.board??``))}),add_file:async t=>{let n=String(t.name??``).trim();return await e.addFile(n,String(t.content??``)),{added:n,note:`A new tab of the sketch: it is sent to the compiler with the main file.`}}}}var Te=[{id:`uno`,name:`Arduino Uno`,fqbn:`arduino:avr:uno`,family:`uno`},{id:`unor4wifi`,name:`Arduino Uno R4 WiFi`,fqbn:`arduino:renesas_uno:unor4wifi`,family:`uno`},{id:`unor4minima`,name:`Arduino Uno R4 Minima`,fqbn:`arduino:renesas_uno:minima`,family:`uno`},{id:`nano`,name:`Arduino Nano`,fqbn:`arduino:avr:nano:cpu=atmega328`,family:`uno`},{id:`nanoold`,name:`Arduino Nano (old bootloader)`,fqbn:`arduino:avr:nano:cpu=atmega328old`,family:`uno`},{id:`nanoevery`,name:`Arduino Nano Every`,fqbn:`arduino:megaavr:nona4809`,family:`other`},{id:`mega`,name:`Arduino Mega 2560`,fqbn:`arduino:avr:mega:cpu=atmega2560`,family:`mega`},{id:`leonardo`,name:`Arduino Leonardo`,fqbn:`arduino:avr:leonardo`,family:`other`},{id:`micro`,name:`Arduino Micro`,fqbn:`arduino:avr:micro`,family:`other`},{id:`promini`,name:`Arduino Pro Mini (5 V, 16 MHz)`,fqbn:`arduino:avr:pro:cpu=16MHzatmega328`,family:`uno`},{id:`due`,name:`Arduino Due (programming port)`,fqbn:`arduino:sam:arduino_due_x_dbg`,family:`other`},{id:`mkrwifi1010`,name:`Arduino MKR WiFi 1010`,fqbn:`arduino:samd:mkrwifi1010`,family:`other`},{id:`esp32`,name:`ESP32 Dev Module`,fqbn:`esp32:esp32:esp32`,family:`other`},{id:`nodemcu`,name:`ESP8266 NodeMCU 1.0`,fqbn:`esp8266:esp8266:nodemcuv2`,family:`other`},{id:`pico`,name:`Raspberry Pi Pico`,fqbn:`rp2040:rp2040:rpipico`,family:`other`}],Ee=`arduino:avr:uno`,D=/^[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+(:[A-Za-z0-9_.=,-]+)?$/,O=e=>D.test(e),De=e=>Te.find(t=>t.fqbn===e),Oe=e=>e.split(`:`).slice(0,2).join(`:`);function ke(e){let t=De(e);if(t)return t.family;let[n,r,i]=e.split(`:`);return n===`arduino`&&r===`avr`?i===`mega`?`mega`:i===`uno`||i===`nano`||i===`pro`?`uno`:`other`:`other`}var Ae=e=>De(e)?.name??e,k=`sketch.ino`,je=/^(.+?):(\d+):(?:(\d+):)?\s*(fatal error|error|warning|note):\s*(.*)$/;function Me(e,t){let n=e.replace(/\\/g,`/`);if(n.includes(`/libraries/`)||n.includes(`/cores/`)||n.includes(`/packages/`))return null;let r=n.slice(n.lastIndexOf(`/`)+1);return r.endsWith(`.ino.cpp`)&&(r=r.slice(0,-4)),t.has(r)?r:null}function A(e,t=[k]){let n=new Set(t),r=[];for(let t of e.split(`
`)){let e=je.exec(t.trim());if(!e)continue;let i=Me(e[1],n),a={file:i??e[1],line:Number(e[2]),col:e[3]?Number(e[3]):1,severity:e[4]===`warning`?`warning`:e[4]===`note`?`note`:`error`,message:e[5].trim()};if(i===null&&(a.external=!0),r.some(e=>e.file===a.file&&e.line===a.line&&e.col===a.col&&e.message===a.message)||r.push(a),r.length>=200)break}return r}function j(e){let t={},n=/Sketch uses (\d+) bytes(?: \(\d+%\))?(?: of program storage space\.?)?(?: Maximum is (\d+) bytes)?/i.exec(e);n&&(t.flash=Number(n[1]),t.flashMax=n[2]?Number(n[2]):null);let r=/Global variables use (\d+) bytes(?: \(\d+%\))?(?: of dynamic memory)?(?:, leaving \d+ bytes for local variables)?(?:\. Maximum is (\d+) bytes)?/i.exec(e);return r&&(t.ram=Number(r[1]),t.ramMax=r[2]?Number(r[2]):null),t.flash!==void 0||t.ram!==void 0?t:null}function Ne(e){if(!e)return[];let t=(e,t,n)=>t===void 0?[]:[{label:e,used:t,max:n??null,percent:n?Math.min(100,Math.round(t/n*1e3)/10):null}];return[...t(`Program storage`,e.flash,e.flashMax),...t(`Dynamic memory (RAM)`,e.ram,e.ramMax)]}function Pe(e){return e>=1e4?`${(e/1024).toFixed(1)} kB`:`${e} B`}function Fe(e,t){let n=String(e.output??``);return{...e,ok:!!e.ok,cli:e.cli!==!1,output:n,diagnostics:Array.isArray(e.diagnostics)?e.diagnostics:A(n,t),size:e.size===void 0?j(n):e.size}}var Ie=e=>e.filter(e=>e.severity===`error`).length,Le=e=>e.filter(e=>e.severity===`warning`).length,M=e=>new Set(e.split(/\s+/).filter(Boolean)),Re=M(`if else for while do switch case default break continue return goto sizeof typedef struct union class
  enum namespace template typename public private protected virtual static const constexpr volatile extern inline new delete
  this using operator try catch throw register unsigned signed auto`),ze=M(`void int long short char float double bool boolean byte word size_t String uint8_t uint16_t uint32_t uint64_t
  int8_t int16_t int32_t int64_t Serial Wire SPI EEPROM Servo Stepper`),Be=M(`true false NULL nullptr HIGH LOW INPUT OUTPUT INPUT_PULLUP LED_BUILTIN LSBFIRST MSBFIRST CHANGE RISING FALLING
  PI HALF_PI TWO_PI DEG_TO_RAD RAD_TO_DEG DEC HEX OCT BIN A0 A1 A2 A3 A4 A5 A6 A7 SDA SCL SS MOSI MISO SCK`),Ve=M(`setup loop pinMode digitalWrite digitalRead analogRead analogWrite analogReference tone noTone pulseIn
  shiftOut shiftIn delay delayMicroseconds millis micros map constrain min max abs sq sqrt pow sin cos tan random randomSeed
  attachInterrupt detachInterrupt digitalPinToInterrupt interrupts noInterrupts bitRead bitWrite bitSet bitClear lowByte highByte
  begin end print println write read available flush parseInt parseFloat readStringUntil attach detach`),He=C.define({name:`cpp`,startState:()=>({block:!1,header:!1}),token(e,t){if(t.block)return e.skipTo(`*/`)?(e.match(`*/`),t.block=!1):e.skipToEnd(),`comment`;if(e.eatSpace())return null;if(e.match(`//`))return e.skipToEnd(),`comment`;if(e.match(`/*`))return t.block=!0,e.skipTo(`*/`)?(e.match(`*/`),t.block=!1):e.skipToEnd(),`comment`;if(t.header&&e.match(/^<[^>\n]*>/))return t.header=!1,`string`;if(e.peek()===`#`&&e.match(/^#\s*\w+/))return t.header=/include/.test(e.current()),`meta`;let n=e.peek();if(n===`"`||n===`'`){e.next();let r=!1,i;for(;(i=e.next())!=null&&(i!==n||r);)r=!r&&i===`\\`;return t.header=!1,`string`}if(e.match(/^(?:0[xX][\da-fA-F]+|0[bB][01]+|(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)[uUlLfF]*/))return`number`;if(e.match(/^[A-Za-z_]\w*/)){let t=e.current();return Re.has(t)?`keyword`:ze.has(t)?`typeName`:Be.has(t)?`atom`:Ve.has(t)||e.match(/^\s*\(/,!1)?`variableName.function`:`variableName`}return e.next(),null},languageData:{commentTokens:{line:`//`,block:{open:`/*`,close:`*/`}},closeBrackets:{brackets:[`(`,`[`,`{`,`'`,`"`]}}}),Ue=_e.define(),N=class extends he{severity;constructor(e){super(),this.severity=e}eq(e){return e.severity===this.severity}toDOM(){let e=document.createElement(`span`);return e.className=`ka-dot ka-dot-${this.severity}`,e.textContent=`●`,e}},We={error:new N(`error`),warning:new N(`warning`),note:new N(`note`)};function Ge(e,t){let n={error:0,warning:1,note:2},r=new Map;for(let i of e){if(i.line<1||i.line>t)continue;let e=r.get(i.line);(!e||n[i.severity]<n[e.severity])&&r.set(i.line,i)}return[...r.values()].sort((e,t)=>e.line-t.line)}var Ke=me.define({create:()=>S.none,update(e,t){e=e.map(t.changes);for(let n of t.effects){if(!n.is(Ue))continue;let r=new ve;for(let e of Ge(n.value,t.state.doc.lines))r.add(t.state.doc.line(e.line).from,t.state.doc.line(e.line).from,S.line({class:`ka-mark ka-mark-${e.severity}`,attributes:{title:e.message}}));e=r.finish()}return e},provide:e=>x.decorations.from(e)}),qe=me.define({create:()=>ye.empty,update(e,t){e=e.map(t.changes);for(let n of t.effects)n.is(Ue)&&(e=ye.of(Ge(n.value,t.state.doc.lines).map(e=>We[e.severity].range(t.state.doc.line(e.line).from)),!0));return e}}),Je=[Ke,qe,ge({class:`ka-gutter`,markers:e=>e.state.field(qe),initialSpacer:()=>We.error})];function Ye(e){e.dispatch({effects:_e.appendConfig.of([He,Je])})}function Xe(e,t){e.dispatch({effects:Ue.of(t)})}function Ze(e,t,n=1){let r=e.state.doc.line(Math.min(Math.max(1,t),e.state.doc.lines)),i=Math.min(r.to,r.from+Math.max(0,n-1));e.dispatch({selection:{anchor:r.from,head:r.to},effects:x.scrollIntoView(i,{y:`center`})}),e.focus()}function Qe(e,t){let n=e.state.selection.main;e.dispatch({changes:{from:n.from,to:n.to,insert:t},selection:{anchor:n.from+t.length},scrollIntoView:!0}),e.focus()}var P=`arduino:avr:uno`,F=[{id:`blink`,title:`Blink`,category:`Basics`,board:P,libraries:[],description:`Blinks the built-in LED and reports it on the serial monitor.`,wiring:`Nothing to wire: the built-in LED (pin 13 on an Uno or Nano) blinks.
For an external LED: pin 13 -> 220 ohm resistor -> LED long leg (anode); LED short leg -> GND.`,code:`// Blink: the built-in LED on pin 13 blinks once a second.
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  Serial.println("on");
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  Serial.println("off");
  delay(500);
}
`},{id:`fade`,title:`Fade (PWM)`,category:`Basics`,board:P,libraries:[],description:`Fades an LED up and down with analogWrite (PWM).`,wiring:`Pin 9 (a PWM pin, marked ~) -> 220 ohm resistor -> LED anode; LED cathode -> GND.
PWM pins on an Uno: 3, 5, 6, 9, 10, 11.`,code:`// Fade: the brightness of an LED goes up and down using PWM.
const int ledPin = 9;
int brightness = 0;
int step = 5;

void setup() {
  pinMode(ledPin, OUTPUT);
}

void loop() {
  analogWrite(ledPin, brightness);
  brightness += step;
  if (brightness <= 0 || brightness >= 255) {
    step = -step;
  }
  delay(30);
}
`},{id:`button`,title:`Button with pull-up`,category:`Basics`,board:P,libraries:[],description:`Lights the LED while a button is pressed, using the internal pull-up resistor.`,wiring:`Button between pin 2 and GND (no external resistor: INPUT_PULLUP keeps the pin HIGH until the button pulls it to GND).
LED: pin 13 (built-in) or pin 8 -> 220 ohm -> LED -> GND.`,code:`// Button: pressed = LOW, because of INPUT_PULLUP.
const int buttonPin = 2;
const int ledPin = 13;

void setup() {
  pinMode(buttonPin, INPUT_PULLUP);
  pinMode(ledPin, OUTPUT);
}

void loop() {
  bool pressed = digitalRead(buttonPin) == LOW;
  digitalWrite(ledPin, pressed ? HIGH : LOW);
}
`},{id:`debounce`,title:`Debounce a button`,category:`Basics`,board:P,libraries:[],description:`Toggles an LED on each clean button press, ignoring contact bounce.`,wiring:`Button between pin 2 and GND (INPUT_PULLUP). LED on pin 13 (built-in).`,code:`// Debounce: a press counts only when the reading is stable for 50 ms.
const int buttonPin = 2;
const int ledPin = 13;
const unsigned long debounceMs = 50;

int ledState = LOW;
int lastReading = HIGH;
int stableState = HIGH;
unsigned long lastChange = 0;

void setup() {
  pinMode(buttonPin, INPUT_PULLUP);
  pinMode(ledPin, OUTPUT);
}

void loop() {
  int reading = digitalRead(buttonPin);
  if (reading != lastReading) {
    lastChange = millis();
    lastReading = reading;
  }
  if (millis() - lastChange > debounceMs && reading != stableState) {
    stableState = reading;
    if (stableState == LOW) {
      ledState = !ledState;
      digitalWrite(ledPin, ledState);
    }
  }
}
`},{id:`echo`,title:`Serial echo`,category:`Serial`,board:P,libraries:[],description:`Sends back every line you type in the serial monitor.`,wiring:`Nothing to wire. Connect the serial monitor at 9600 baud and send a line.`,code:`// Serial echo: type a line in the serial monitor and the board repeats it.
void setup() {
  Serial.begin(9600);
  Serial.println("Type something and press Send.");
}

void loop() {
  if (Serial.available() > 0) {
    String line = Serial.readStringUntil('\\n');
    line.trim();
    Serial.print("You said: ");
    Serial.println(line);
  }
}
`},{id:`plotter-demo`,title:`Serial plotter demo`,category:`Serial`,board:P,libraries:[],description:`Prints two labelled waves, ready for the serial plotter (label:value pairs).`,wiring:`Nothing to wire. Open the Serial plotter and connect at 115200 baud.`,code:`// Two waves in the label:value format the serial plotter understands.
void setup() {
  Serial.begin(115200);
}

void loop() {
  float t = millis() / 1000.0;
  Serial.print("sin:");
  Serial.print(sin(t * 2.0));
  Serial.print(",cos:");
  Serial.println(cos(t * 2.0));
  delay(20);
}
`},{id:`analog-plot`,title:`Analog read to the plotter`,category:`Sensors`,board:P,libraries:[],description:`Reads A0 and prints the value, one number per line, for the serial plotter.`,wiring:`Potentiometer: one outer pin -> 5V, the other outer pin -> GND, the middle pin (wiper) -> A0.
Or leave A0 open to see noise.`,code:`// Analog read: 0 to 1023 on A0, printed for the serial plotter.
const int sensorPin = A0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  int value = analogRead(sensorPin);
  Serial.println(value);
  delay(10);
}
`},{id:`ldr`,title:`Light sensor (LDR)`,category:`Sensors`,board:P,libraries:[],description:`Reads a light-dependent resistor and switches an LED on when it gets dark.`,wiring:`LDR between 5V and A0; a 10 kohm resistor between A0 and GND (a voltage divider).
LED: pin 9 -> 220 ohm -> LED -> GND.`,code:`// LDR: the darker it is, the lower the reading (with the LDR on the 5V side).
const int ldrPin = A0;
const int ledPin = 9;
const int darkLevel = 400;

void setup() {
  pinMode(ledPin, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int light = analogRead(ldrPin);
  bool dark = light < darkLevel;
  digitalWrite(ledPin, dark ? HIGH : LOW);
  Serial.print("light:");
  Serial.println(light);
  delay(100);
}
`},{id:`pot-led`,title:`Potentiometer controls an LED`,category:`Sensors`,board:P,libraries:[],description:`The knob sets the brightness of an LED: analogRead mapped to analogWrite.`,wiring:`Potentiometer: outer pins -> 5V and GND, wiper -> A0.
LED: pin 9 (PWM) -> 220 ohm -> LED -> GND.`,code:`// Potentiometer to LED brightness.
const int potPin = A0;
const int ledPin = 9;

void setup() {
  pinMode(ledPin, OUTPUT);
}

void loop() {
  int reading = analogRead(potPin);
  int brightness = map(reading, 0, 1023, 0, 255);
  analogWrite(ledPin, brightness);
}
`},{id:`servo`,title:`Servo sweep`,category:`Motors`,board:P,libraries:[`Servo`],description:`Sweeps a hobby servo from 0 to 180 degrees and back.`,wiring:`Servo signal (orange/yellow) -> pin 9; red -> 5V; brown/black -> GND.
For bigger servos use an external 5 V supply and join its GND with the Arduino GND.`,code:`#include <Servo.h>

// Servo sweep: the library Servo comes with the Arduino IDE.
Servo servo;
const int servoPin = 9;

void setup() {
  servo.attach(servoPin);
}

void loop() {
  for (int angle = 0; angle <= 180; angle += 2) {
    servo.write(angle);
    delay(15);
  }
  for (int angle = 180; angle >= 0; angle -= 2) {
    servo.write(angle);
    delay(15);
  }
}
`},{id:`hcsr04`,title:`Ultrasonic distance (HC-SR04)`,category:`Sensors`,board:P,libraries:[],description:`Measures a distance in centimetres with an HC-SR04 and prints it.`,wiring:`HC-SR04: VCC -> 5V, GND -> GND, TRIG -> pin 9, ECHO -> pin 10.`,code:`// HC-SR04: a 10 microsecond pulse on TRIG, the ECHO pulse length gives the distance.
const int trigPin = 9;
const int echoPin = 10;

void setup() {
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH, 30000);
  float cm = duration * 0.0343 / 2.0;
  Serial.print("distance_cm:");
  Serial.println(cm);
  delay(100);
}
`},{id:`dht`,title:`Temperature and humidity (DHT11/22)`,category:`Sensors`,board:P,libraries:[`DHT sensor library`,`Adafruit Unified Sensor`],description:`Reads a DHT11 or DHT22 and prints temperature and humidity.`,wiring:`DHT module: VCC -> 5V, GND -> GND, DATA -> pin 2 (a bare sensor needs a 10 kohm pull-up between DATA and VCC).
For a DHT22 change DHTTYPE to DHT22.
Libraries: DHT sensor library and Adafruit Unified Sensor (Tools > Manage libraries).`,code:`#include <DHT.h>

// DHT11 / DHT22: install "DHT sensor library" and "Adafruit Unified Sensor".
#define DHTPIN 2
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(9600);
  dht.begin();
}

void loop() {
  delay(2000);
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();
  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("Could not read the sensor");
    return;
  }
  Serial.print("temp:");
  Serial.print(temperature);
  Serial.print(" hum:");
  Serial.println(humidity);
}
`},{id:`lcd`,title:`LCD 16x2 (I2C) hello`,category:`Displays`,board:P,libraries:[`LiquidCrystal I2C`],description:`Writes text on a 16x2 character LCD with an I2C backpack.`,wiring:`I2C backpack: VCC -> 5V, GND -> GND, SDA -> A4, SCL -> A5 (on a Mega: SDA 20, SCL 21).
The I2C address is often 0x27 or 0x3F.
Library: LiquidCrystal I2C.`,code:`#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// 16 columns, 2 rows. If nothing shows, try the address 0x3F and turn the contrast screw.
LiquidCrystal_I2C lcd(0x27, 16, 2);

void setup() {
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Hello, kArduino!");
}

void loop() {
  lcd.setCursor(0, 1);
  lcd.print("up ");
  lcd.print(millis() / 1000);
  lcd.print(" s   ");
  delay(250);
}
`},{id:`traffic`,title:`Traffic light (state machine)`,category:`LEDs`,board:P,libraries:[],description:`Red, green and yellow LEDs run by a small state machine with millis().`,wiring:`Red LED -> pin 8, yellow LED -> pin 9, green LED -> pin 10, each through a 220 ohm resistor to the LED anode; all cathodes -> GND.`,code:`// Traffic light: three states, each lasts a different time.
const int redPin = 8;
const int yellowPin = 9;
const int greenPin = 10;

enum State { RED, GREEN, YELLOW };
State state = RED;
unsigned long stateStart = 0;

unsigned long durationOf(State s) {
  if (s == RED) return 4000;
  if (s == GREEN) return 3000;
  return 1000;
}

void show(State s) {
  digitalWrite(redPin, s == RED);
  digitalWrite(yellowPin, s == YELLOW);
  digitalWrite(greenPin, s == GREEN);
}

void setup() {
  pinMode(redPin, OUTPUT);
  pinMode(yellowPin, OUTPUT);
  pinMode(greenPin, OUTPUT);
  show(state);
}

void loop() {
  if (millis() - stateStart >= durationOf(state)) {
    stateStart = millis();
    if (state == RED) state = GREEN;
    else if (state == GREEN) state = YELLOW;
    else state = RED;
    show(state);
  }
}
`},{id:`knight-rider`,title:`Knight Rider`,category:`LEDs`,board:P,libraries:[],description:`Six LEDs with a light that runs back and forth.`,wiring:`Six LEDs on pins 2 to 7, each through a 220 ohm resistor to the LED anode; all cathodes -> GND.`,code:`// Knight Rider: a moving light on six LEDs.
const int firstPin = 2;
const int lastPin = 7;

void setup() {
  for (int pin = firstPin; pin <= lastPin; pin++) {
    pinMode(pin, OUTPUT);
  }
}

void sweep(int from, int to, int stepBy) {
  for (int pin = from; pin != to + stepBy; pin += stepBy) {
    digitalWrite(pin, HIGH);
    delay(70);
    digitalWrite(pin, LOW);
  }
}

void loop() {
  sweep(firstPin, lastPin, 1);
  sweep(lastPin - 1, firstPin + 1, -1);
}
`},{id:`tone`,title:`Tone melody`,category:`Sound`,board:P,libraries:[],description:`Plays a short melody on a piezo buzzer with tone().`,wiring:`Piezo buzzer: + -> pin 8, - -> GND (a passive buzzer; an active one only beeps).`,code:`// Tone melody: frequencies in Hz and note lengths (4 = quarter note).
#define NOTE_C4 262
#define NOTE_D4 294
#define NOTE_E4 330
#define NOTE_F4 349
#define NOTE_G4 392
#define NOTE_A4 440

const int buzzerPin = 8;
const int melody[] = {NOTE_C4, NOTE_C4, NOTE_G4, NOTE_G4, NOTE_A4, NOTE_A4, NOTE_G4,
                      NOTE_F4, NOTE_F4, NOTE_E4, NOTE_E4, NOTE_D4, NOTE_D4, NOTE_C4};
const int lengths[] = {4, 4, 4, 4, 4, 4, 2, 4, 4, 4, 4, 4, 4, 2};

void setup() {
  for (int i = 0; i < 14; i++) {
    int ms = 1000 / lengths[i];
    tone(buzzerPin, melody[i], ms);
    delay(ms * 1.3);
    noTone(buzzerPin);
  }
}

void loop() {
}
`},{id:`millis-blink`,title:`Blink without delay (millis)`,category:`Timing`,board:P,libraries:[],description:`Blinks an LED with millis() so the loop stays free for other work.`,wiring:`Built-in LED on pin 13, or an external LED on pin 13 through 220 ohm to GND.`,code:`// Non-blocking blink: loop() keeps running, so it can do other things as well.
const int ledPin = 13;
const unsigned long interval = 500;
unsigned long previous = 0;
int ledState = LOW;

void setup() {
  pinMode(ledPin, OUTPUT);
}

void loop() {
  unsigned long now = millis();
  if (now - previous >= interval) {
    previous = now;
    ledState = (ledState == LOW) ? HIGH : LOW;
    digitalWrite(ledPin, ledState);
  }
  // other work can go here
}
`},{id:`interrupt`,title:`Interrupt button`,category:`Timing`,board:P,libraries:[],description:`A button on an interrupt pin toggles the LED at once, even during a delay().`,wiring:`Button between pin 2 (interrupt INT0) and GND, using INPUT_PULLUP. Pins 2 and 3 are the interrupt pins of an Uno.
LED on pin 13 (built-in).`,code:`// Interrupt: onPress() runs as soon as pin 2 goes from HIGH to LOW.
const int buttonPin = 2;
const int ledPin = 13;
volatile bool ledOn = false;
volatile unsigned long lastPress = 0;

void onPress() {
  unsigned long now = millis();
  if (now - lastPress > 200) {
    ledOn = !ledOn;
    lastPress = now;
  }
}

void setup() {
  pinMode(buttonPin, INPUT_PULLUP);
  pinMode(ledPin, OUTPUT);
  attachInterrupt(digitalPinToInterrupt(buttonPin), onPress, FALLING);
}

void loop() {
  digitalWrite(ledPin, ledOn);
  delay(1000);  // the button still reacts during this delay
}
`},{id:`eeprom`,title:`EEPROM counter`,category:`Memory`,board:P,libraries:[],description:`Counts the number of times the board started, and remembers it after power off.`,wiring:`Nothing to wire. Each EEPROM cell survives about 100 000 writes: do not write it in loop().`,code:`#include <EEPROM.h>

// The start counter lives in EEPROM address 0 and survives a power cut.
const int address = 0;

void setup() {
  Serial.begin(9600);
  unsigned int count;
  EEPROM.get(address, count);
  if (count == 0xFFFF) {
    count = 0;  // a new EEPROM reads as 0xFFFF
  }
  count++;
  EEPROM.put(address, count);
  Serial.print("This board has started ");
  Serial.print(count);
  Serial.println(" times.");
}

void loop() {
}
`},{id:`stepper`,title:`Stepper motor (28BYJ-48)`,category:`Motors`,board:P,libraries:[`Stepper`],description:`Turns a 28BYJ-48 stepper (ULN2003 driver) one revolution each way.`,wiring:`ULN2003 board: IN1 -> pin 8, IN2 -> pin 9, IN3 -> pin 10, IN4 -> pin 11; VCC -> 5V, GND -> GND.
The Stepper library comes with the Arduino IDE; the coil order 8-10-9-11 is correct for this motor.`,code:`#include <Stepper.h>

// 28BYJ-48: 2048 steps per revolution. The coil order is 1-3-2-4.
const int stepsPerRevolution = 2048;
Stepper stepper(stepsPerRevolution, 8, 10, 9, 11);

void setup() {
  stepper.setSpeed(10);  // revolutions per minute
}

void loop() {
  stepper.step(stepsPerRevolution);
  delay(500);
  stepper.step(-stepsPerRevolution);
  delay(500);
}
`},{id:`seven-seg`,title:`7-segment counter`,category:`Displays`,board:P,libraries:[],description:`Counts from 0 to 9 on a common-cathode 7-segment display.`,wiring:`Segments a, b, c, d, e, f, g -> pins 2 to 8, each through a 220 ohm resistor.
The common pin -> GND (common cathode). For a common anode, connect it to 5V and swap HIGH and LOW.`,code:`// 7-segment display, common cathode. Bit order: a b c d e f g (bit 0 = a).
const int segmentPins[7] = {2, 3, 4, 5, 6, 7, 8};
const byte digits[10] = {
  0b0111111, 0b0000110, 0b1011011, 0b1001111, 0b1100110,
  0b1101101, 0b1111101, 0b0000111, 0b1111111, 0b1101111
};

void show(int n) {
  for (int s = 0; s < 7; s++) {
    digitalWrite(segmentPins[s], (digits[n] >> s) & 1);
  }
}

void setup() {
  for (int s = 0; s < 7; s++) {
    pinMode(segmentPins[s], OUTPUT);
  }
}

void loop() {
  for (int n = 0; n < 10; n++) {
    show(n);
    delay(700);
  }
}
`},{id:`neopixel`,title:`NeoPixel rainbow`,category:`LEDs`,board:P,libraries:[`Adafruit NeoPixel`],description:`A rainbow that rolls along a WS2812 (NeoPixel) strip.`,wiring:`Strip DIN -> pin 6 through a 330 ohm resistor; 5V -> 5V (an external supply for more than a few LEDs, 60 mA each at full white); GND -> GND, shared with the Arduino.
Library: Adafruit NeoPixel.`,code:`#include <Adafruit_NeoPixel.h>

// Rainbow on 16 NeoPixels. Install "Adafruit NeoPixel" first.
const int ledPin = 6;
const int ledCount = 16;
Adafruit_NeoPixel strip(ledCount, ledPin, NEO_GRB + NEO_KHZ800);
long firstHue = 0;

void setup() {
  strip.begin();
  strip.setBrightness(40);
  strip.show();
}

void loop() {
  for (int i = 0; i < ledCount; i++) {
    long hue = firstHue + (i * 65536L / ledCount);
    strip.setPixelColor(i, strip.gamma32(strip.ColorHSV(hue)));
  }
  strip.show();
  firstHue += 256;
  delay(10);
}
`},{id:`tmp36`,title:`Temperature sensor TMP36`,category:`Sensors`,board:P,libraries:[],description:`Reads a TMP36 and prints the temperature as temp:value for the serial plotter.`,wiring:`TMP36 (flat side towards you): left pin -> 5V, middle pin -> A0, right pin -> GND.
A 0.1 uF capacitor between the left pin and GND steadies the reading.`,code:`// TMP36: 10 mV per degree Celsius with a 500 mV offset.
const int sensorPin = A0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int reading = analogRead(sensorPin);
  float volts = reading * 5.0 / 1024.0;
  float celsius = (volts - 0.5) * 100.0;
  Serial.print("temp:");
  Serial.println(celsius);
  delay(500);
}
`},{id:`relay`,title:`Relay timer`,category:`Motors`,board:P,libraries:[],description:`Switches a relay on for 10 seconds, then off for 5, using millis().`,wiring:`Relay module: VCC -> 5V, GND -> GND, IN -> pin 7. Many modules switch ON when IN is LOW: set ACTIVE_LOW below.
Switch only low-voltage loads yourself; mains voltage is dangerous.`,code:`// Relay timer: on 10 s, off 5 s.
const int relayPin = 7;
const bool ACTIVE_LOW = true;
const unsigned long onTime = 10000;
const unsigned long offTime = 5000;

bool relayOn = false;
unsigned long changedAt = 0;

void setRelay(bool on) {
  relayOn = on;
  digitalWrite(relayPin, (on != ACTIVE_LOW) ? HIGH : LOW);
}

void setup() {
  pinMode(relayPin, OUTPUT);
  setRelay(false);
  Serial.begin(9600);
}

void loop() {
  unsigned long wait = relayOn ? onTime : offTime;
  if (millis() - changedAt >= wait) {
    changedAt = millis();
    setRelay(!relayOn);
    Serial.println(relayOn ? "relay on" : "relay off");
  }
}
`},{id:`morse`,title:`Morse code`,category:`LEDs`,board:P,libraries:[],description:`Sends a message in Morse code on the built-in LED.`,wiring:`Nothing to wire: the built-in LED (pin 13) flashes. Add an external LED on pin 13 if you like.`,code:`// Morse code on the LED. A dot is 1 unit, a dash 3, the gap between letters 3, words 7.
const int ledPin = 13;
const int unit = 200;
const char* letters[] = {
  ".-", "-...", "-.-.", "-..", ".", "..-.", "--.", "....", "..", ".---", "-.-", ".-..", "--",
  "-.", "---", ".--.", "--.-", ".-.", "...", "-", "..-", "...-", ".--", "-..-", "-.--", "--.."
};
const char* numbers[] = {"-----", ".----", "..---", "...--", "....-", ".....", "-....", "--...", "---..", "----."};

void flash(int units) {
  digitalWrite(ledPin, HIGH);
  delay(units * unit);
  digitalWrite(ledPin, LOW);
  delay(unit);
}

void sendSymbols(const char* code) {
  for (int i = 0; code[i] != 0; i++) {
    flash(code[i] == '.' ? 1 : 3);
  }
  delay(2 * unit);
}

void sendMessage(const char* text) {
  for (int i = 0; text[i] != 0; i++) {
    char c = toupper(text[i]);
    if (c >= 'A' && c <= 'Z') sendSymbols(letters[c - 'A']);
    else if (c >= '0' && c <= '9') sendSymbols(numbers[c - '0']);
    else delay(4 * unit);
  }
}

void setup() {
  pinMode(ledPin, OUTPUT);
}

void loop() {
  sendMessage("SOS KHERVE");
  delay(3000);
}
`}],$e=[...new Set(F.map(e=>e.category))],et=e=>F.find(t=>t.id===e),tt=`void setup() {
  // runs once
}

void loop() {
  // runs again and again
}
`,nt=[{id:`skeleton`,title:`setup() and loop()`,code:tt},{id:`pinmode`,title:`pinMode`,code:`pinMode(LED_BUILTIN, OUTPUT);
`},{id:`serial`,title:`Serial.begin`,code:`Serial.begin(9600);
`},{id:`print`,title:`Serial.println`,code:`Serial.println(value);
`},{id:`dwrite`,title:`digitalWrite / digitalRead`,code:`digitalWrite(13, HIGH);
int state = digitalRead(2);
`},{id:`awrite`,title:`analogRead / analogWrite`,code:`int reading = analogRead(A0);
analogWrite(9, reading / 4);
`},{id:`millis`,title:`millis() timer`,code:`static unsigned long last = 0;
if (millis() - last >= 1000) {
  last = millis();
  // runs once a second
}
`},{id:`map`,title:`map and constrain`,code:`int scaled = map(reading, 0, 1023, 0, 255);
scaled = constrain(scaled, 0, 255);
`},{id:`ifelse`,title:`if / else`,code:`if (condition) {
  // then
} else {
  // otherwise
}
`},{id:`for`,title:`for loop`,code:`for (int i = 0; i < 10; i++) {
  
}
`},{id:`while`,title:`while loop`,code:`while (condition) {
  
}
`},{id:`function`,title:`Function`,code:`int addTwo(int a, int b) {
  return a + b;
}
`},{id:`interrupt`,title:`attachInterrupt`,code:`attachInterrupt(digitalPinToInterrupt(2), onEvent, FALLING);
`},{id:`servo`,title:`Servo`,code:`#include <Servo.h>
Servo servo;
// in setup(): servo.attach(9);
// in loop():  servo.write(90);
`},{id:`define`,title:`Pin constant`,code:`const int ledPin = 9;
`}],I=v();function rt({result:e,busy:t,onJump:n}){let[a,o]=(0,T.useState)(`problems`);if(!e&&!t)return null;let s=e?.diagnostics??[],c=Ne(e?.size??null);return(0,I.jsxs)(`section`,{className:`ka-problems`,"aria-label":`Compiler`,children:[(0,I.jsxs)(`div`,{className:`ka-tabs`,role:`tablist`,children:[(0,I.jsxs)(`button`,{role:`tab`,"aria-selected":a===`problems`,className:a===`problems`?`on`:``,onClick:()=>o(`problems`),children:[`Problems`,e?` (${Ie(s)} errors, ${Le(s)} warnings)`:``]}),(0,I.jsx)(`button`,{role:`tab`,"aria-selected":a===`output`,className:a===`output`?`on`:``,onClick:()=>o(`output`),children:`Output`}),(0,I.jsx)(`span`,{className:`ka-verdict ${t?``:e?.ok?`ok`:`bad`}`,children:t?t===`upload`?`Uploading…`:`Compiling…`:e?.uploaded?`Uploaded`:e?.ok?`Compiled`:`Failed`})]}),e&&c.length>0&&(0,I.jsx)(`div`,{className:`ka-sizes`,children:c.map(e=>(0,I.jsxs)(`div`,{className:`ka-size`,title:e.max?`${e.used} of ${e.max} bytes`:`${e.used} bytes`,children:[(0,I.jsx)(`span`,{className:`ka-size-label`,children:e.label}),(0,I.jsx)(`span`,{className:`ka-bar`,children:(0,I.jsx)(`span`,{className:`ka-fill${e.percent!==null&&e.percent>90?` high`:e.percent!==null&&e.percent>70?` mid`:``}`,style:{width:`${e.percent??0}%`}})}),(0,I.jsxs)(`span`,{className:`ka-size-num`,children:[Pe(e.used),e.max?` of ${Pe(e.max)} (${e.percent}%)`:``]})]},e.label))}),e&&a===`problems`&&(0,I.jsxs)(`div`,{className:`ka-diags`,children:[s.map((e,t)=>(0,I.jsxs)(`button`,{className:`ka-diag ${e.severity}`,onClick:()=>n(e),title:e.external?e.file:`Go to ${e.file===`sketch.ino`?`the sketch`:e.file}, line ${e.line}`,children:[e.severity===`error`?(0,I.jsx)(g,{size:13}):e.severity===`warning`?(0,I.jsx)(r,{size:13}):(0,I.jsx)(i,{size:13}),(0,I.jsxs)(`span`,{className:`ka-diag-where`,children:[e.external?e.file.split(`/`).pop():e.file===`sketch.ino`?`sketch`:e.file,`:`,e.line]}),(0,I.jsx)(`span`,{className:`ka-diag-msg`,children:e.message})]},t)),!s.length&&(0,I.jsx)(`div`,{className:`k-muted ka-pad`,children:e.ok?`No problems.`:`No line-level problems were reported: see Output.`})]}),e&&a===`output`&&(0,I.jsx)(`pre`,{className:`ka-out ${e.ok?`ok`:`bad`}`,"aria-label":`Compiler output`,children:e.output})]})}var it=/(?:([A-Za-z_][\w.-]*)\s*[:=]\s*)?(?<![\w.])([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)(?![\d.])/g;function at(e){let t=[];for(let n of e.matchAll(it)){let e=Number(n[2]);if(Number.isFinite(e)&&(t.push({label:n[1]??null,value:e}),t.length>=12))break}return t.length?t:null}var ot=[`var(--k-accent)`,`var(--k-link)`,`var(--k-warning)`,`var(--k-danger)`,`var(--k-success)`,`color-mix(in srgb, var(--k-accent) 50%, var(--k-text))`,`color-mix(in srgb, var(--k-link) 50%, var(--k-danger))`,`color-mix(in srgb, var(--k-warning) 50%, var(--k-text))`],st=e=>ot[e%ot.length],ct=class{max;names=[];rows=[];total=0;constructor(e=300){this.max=e}get length(){return this.rows.length}clear(){this.names=[],this.rows=[],this.total=0}push(e){let t=Array(this.names.length).fill(NaN);e.forEach((e,n)=>{let r=e.label??`ch${n+1}`,i=this.names.indexOf(r);if(i<0){if(this.names.length>=12)return;i=this.names.length,this.names.push(r);for(let e of this.rows)e.push(NaN);t.push(NaN)}t[i]=e.value}),this.rows.push(t),this.total++,this.rows.length>this.max&&this.rows.shift()}pushLine(e){let t=at(e);return t?(this.push(t),!0):!1}columns(){return this.names.map((e,t)=>({name:e,values:this.rows.map(e=>e[t])}))}bounds(e=new Set){let t=1/0,n=-1/0;return this.names.forEach((r,i)=>{if(!e.has(r))for(let e of this.rows){let r=e[i];Number.isFinite(r)&&(r<t&&(t=r),r>n&&(n=r))}}),t<=n?{min:t,max:n}:null}toCsv(){let e=[`sample`,...this.names].join(`,`),t=this.total-this.rows.length;return[e,...this.rows.map((e,n)=>[t+n,...e.map(e=>Number.isFinite(e)?e:``)].join(`,`))].join(`
`)+`
`}};function lt(e){if(!e)return{lo:0,hi:1};let{min:t,max:n}=e;t===n&&(--t,n+=1);let r=(n-t)*.06;return{lo:t-r,hi:n+r}}function ut(e,t,n=5){let r=t-e;if(!(r>0))return[e];let i=r/Math.max(1,n),a=10**Math.floor(Math.log10(i)),o=[1,2,2.5,5,10].map(e=>e*a).find(e=>e>=i)??10*a,s=[];for(let n=Math.ceil(e/o)*o;n<=t+o*1e-9;n+=o)s.push(Number(n.toPrecision(12)));return s}function L(e,t,n){let r=``,i=!1;return e.forEach((e,a)=>{if(!Number.isFinite(e)){i=!1;return}r+=`${i?`L`:`M`}${t(a).toFixed(1)} ${n(e).toFixed(1)}`,i=!0}),r}var dt={uno:[3,5,6,9,10,11],mega:[2,3,4,5,6,7,8,9,10,11,12,13,44,45,46],other:[]},ft={uno:[2,3],mega:[2,3,18,19,20,21],other:[]},R={uno:14,mega:54,other:0},z={uno:6,mega:16,other:0},pt={uno:[`A4`,`A5`],mega:[`D20`,`D21`],other:[]},B={uno:[`D10`,`D11`,`D12`,`D13`],mega:[`D50`,`D51`,`D52`,`D53`],other:[]};function mt(e){let t=e=>e.replace(/[^\n]/g,` `);return e.replace(/\/\*[\s\S]*?\*\//g,t).replace(/\/\/[^\n]*/g,t).replace(/"(?:\\.|[^"\\\n])*"/g,e=>`"${t(e.slice(1,-1))}"`).replace(/'(?:\\.|[^'\\\n])*'/g,e=>`'${t(e.slice(1,-1))}'`)}var V=(e,t)=>e.slice(0,t).split(`
`).length,H=class{consts=new Map;arrays=new Map;ranges=new Map;scalar(e){let t=e.trim();if(/^\d+$/.test(t))return Number(t);if(/^A\d+$/.test(t))return t;if(t===`LED_BUILTIN`)return 13;if(this.consts.has(t))return this.consts.get(t)}resolve(e){let t=e.trim().replace(/^\(\s*(?:int|byte|uint8_t)\s*\)\s*/,``);if(this.ranges.has(t))return this.ranges.get(t);let n=this.scalar(t);if(n!==void 0)return[n];let r=/^(\w+)\s*\[[^\]]*\]$/.exec(t);return r&&this.arrays.has(r[1])?this.arrays.get(r[1]):[]}},U=`(?:int|byte|uint8_t|short|long|unsigned\\s+int|unsigned\\s+char|unsigned\\s+long|const\\s+int)`;function W(e){let t=new H;for(let n of e.matchAll(/^[ \t]*#define\s+(\w+)\s+(A\d+|\d+|LED_BUILTIN)\b/gm)){let e=t.scalar(n[2]);e!==void 0&&t.consts.set(n[1],e)}let n=RegExp(`\\b(?:static\\s+)?(?:const(?:expr)?\\s+)?${U}\\s+(\\w+)\\s*=\\s*(A\\d+|\\d+|LED_BUILTIN|\\w+)\\s*[;,]`,`g`);for(let r of e.matchAll(n)){let e=t.scalar(r[2]);e!==void 0&&t.consts.set(r[1],e)}let r=RegExp(`\\b(?:static\\s+)?(?:const(?:expr)?\\s+)?${U}\\s+(\\w+)\\s*\\[[^\\]]*\\]\\s*=\\s*\\{([^}]*)\\}`,`g`);for(let n of e.matchAll(r)){let e=n[2].split(`,`).map(e=>t.scalar(e)).filter(e=>e!==void 0);e.length&&t.arrays.set(n[1],e)}for(let n of e.matchAll(/for\s*\(\s*(?:(?:int|byte|uint8_t|unsigned\s+int)\s+)?(\w+)\s*=\s*(\w+)\s*;\s*\1\s*(<=|<)\s*(\w+)\s*;/g)){let e=t.scalar(n[2]),r=t.scalar(n[4]);if(typeof e==`number`&&typeof r==`number`){let i=n[3]===`<`?r-1:r;i>=e&&i-e<=70&&t.ranges.set(n[1],Array.from({length:i-e+1},(t,n)=>e+n))}}return t}function G(e,t,n=!1){if(typeof e==`string`)return Number(e.slice(1))<z[t]||t===`other`?e:null;if(n&&e<z[t])return`A${e}`;if(t===`other`)return`D${e}`;if(e>=R[t]){let n=e-R[t];return n<z[t]?`A${n}`:null}return`D${e}`}var ht=e=>(e[0]===`D`?0:1e3)+Number(e.slice(1)),gt=[{re:/\bpinMode\s*\(\s*([^,()]+(?:\[[^\]]*\])?)\s*,\s*(\w+)/g,arg:1,role:e=>e[2]===`OUTPUT`?`out`:`in`},{re:/\bdigitalWrite\s*\(\s*([^,()]+(?:\[[^\]]*\])?)\s*,/g,arg:1,role:`out`},{re:/\bdigitalRead\s*\(\s*([^,()]+(?:\[[^\]]*\])?)\s*\)/g,arg:1,role:`in`},{re:/\banalogWrite\s*\(\s*([^,()]+(?:\[[^\]]*\])?)\s*,/g,arg:1,role:`pwm`},{re:/\banalogRead\s*\(\s*([^,()]+(?:\[[^\]]*\])?)\s*\)/g,arg:1,role:`analog`,analog:!0},{re:/\b(?:tone|noTone)\s*\(\s*([^,()]+(?:\[[^\]]*\])?)\s*[,)]/g,arg:1,role:`out`},{re:/\bpulseIn\s*\(\s*([^,()]+(?:\[[^\]]*\])?)\s*,/g,arg:1,role:`in`},{re:/\battachInterrupt\s*\(\s*digitalPinToInterrupt\s*\(\s*([^()]+)\)/g,arg:1,role:`int`},{re:/\b\w+\.attach\s*\(\s*([^,()]+)\s*[,)]/g,arg:1,role:`out`}],_t={DHT:[0],Adafruit_NeoPixel:[1],Stepper:[1,2,3,4],SoftwareSerial:[0,1],LiquidCrystal:[0,1,2,3,4,5]};function vt(e,t=`uno`){let n=mt(e),r=W(n),i=new Map,a=[],o=e=>{a.includes(e)||a.push(e)},s=(e,t,n)=>{let r=i.get(e)??{pin:e,roles:[],lines:[]};r.roles.includes(t)||r.roles.push(t),!r.lines.includes(n)&&r.lines.length<8&&r.lines.push(n),i.set(e,r)},c=(e,n,r,i)=>{let a=G(e,t,i);if(a===null){o(`Pin ${e} does not exist on this board.`);return}s(a,n,r);let c=Number(a.slice(1));a[0]===`D`&&t!==`other`&&(n===`pwm`&&!dt[t].includes(c)&&o(`analogWrite on pin ${c}: it is not a PWM pin (PWM pins: ${dt[t].join(`, `)}).`),n===`int`&&!ft[t].includes(c)&&o(`attachInterrupt on pin ${c}: only pins ${ft[t].join(`, `)} have an external interrupt.`),n===`analog`&&o(`analogRead on digital pin ${c}: the analog inputs are A0–A${z[t]-1}.`))};for(let e of gt)for(let t of n.matchAll(e.re)){let i=typeof e.role==`function`?e.role(t):e.role,a=V(n,t.index);for(let n of r.resolve(t[e.arg]))c(n,i,a,!!e.analog)}for(let[e,t]of Object.entries(_t))for(let i of n.matchAll(RegExp(`\\b${e}\\s+\\w+\\s*\\(([^)]*)\\)`,`g`))){let e=i[1].split(`,`),a=V(n,i.index);for(let n of t)for(let t of e[n]===void 0?[]:r.resolve(e[n]))c(t,`out`,a,!1)}if(/\bSerial\.begin\s*\(/.test(n)&&t!==`other`){s(`D0`,`bus`,V(n,n.search(/\bSerial\.begin/))),s(`D1`,`bus`,V(n,n.search(/\bSerial\.begin/)));for(let e of[`D0`,`D1`])i.get(e)?.roles.some(e=>e!==`bus`)&&o(`Pins 0 and 1 are the USB serial port (Serial.begin is used): avoid pin ${e.slice(1)}.`)}if(/\bWire\.begin\s*\(/.test(n)||/#include\s*<Wire\.h>/.test(n))for(let e of pt[t])s(e,`bus`,V(n,n.search(/Wire/)));if(/\bSPI\.begin\s*\(/.test(n))for(let e of B[t])s(e,`bus`,V(n,n.search(/SPI\.begin/)));return{pins:[...i.values()].sort((e,t)=>ht(e.pin)-ht(t.pin)),warnings:a}}var K={uno:{0:[`RX`],1:[`TX`],2:[`INT0`],3:[`INT1`],10:[`SS`],11:[`MOSI`],12:[`MISO`],13:[`SCK`,`LED`]},mega:{0:[`RX0`],1:[`TX0`],13:[`LED`],14:[`TX3`],15:[`RX3`],16:[`TX2`],17:[`RX2`],18:[`TX1`,`INT3`],19:[`RX1`,`INT2`],20:[`SDA`,`INT1`],21:[`SCL`,`INT0`],2:[`INT4`],3:[`INT5`],50:[`MISO`],51:[`MOSI`],52:[`SCK`],53:[`SS`]}};function q(e,t){let n=dt[e].includes(t);return{id:`D${t}`,label:String(t),tags:[...n?[`PWM`]:[],...K[e][t]??[]],pwm:n}}function J(e,t){let n=e===`uno`?t===4?[`SDA`]:t===5?[`SCL`]:[]:[];return{id:`A${t}`,label:`A${t}`,tags:n,pwm:!1}}var Y=(e,t)=>Array.from({length:t-e+1},(t,n)=>e+n);function yt(e){return e===`uno`?[{title:`Digital`,pins:Y(0,13).map(e=>q(`uno`,e))},{title:`Analog in`,pins:Y(0,5).map(e=>J(`uno`,e))}]:e===`mega`?[{title:`Digital 0–13`,pins:Y(0,13).map(e=>q(`mega`,e))},{title:`Communication 14–21`,pins:Y(14,21).map(e=>q(`mega`,e))},{title:`Digital 22–53`,pins:Y(22,53).map(e=>q(`mega`,e))},{title:`Analog in`,pins:Y(0,15).map(e=>J(`mega`,e))}]:[]}var X={out:`output`,in:`input`,pwm:`PWM output`,analog:`analog input`,int:`interrupt`,bus:`bus (Serial, I2C, SPI)`},bt=[`.ino`,`.h`,`.cpp`,`.c`,`.hpp`],xt=[300,1200,2400,4800,9600,19200,38400,57600,74880,115200,230400,25e4,5e5,1e6],St=/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;function Ct(e,t,n){if(!St.test(e)||e.includes(`..`))return`Use letters, digits, _ - and one dot, with no folder.`;let r=e.lastIndexOf(`.`),i=r<0?``:e.slice(r).toLowerCase();return bt.includes(i)?[...t,...n?[n]:[]].map(e=>e.toLowerCase()).includes(e.toLowerCase())||e.toLowerCase()===`sketch.ino`?`There is a file with this name already.`:null:`The file must end in ${bt.join(`, `)}.`}function wt(e){return(e.replace(/\.ino$/i,``).replace(/[^A-Za-z0-9_-]+/g,`_`).replace(/^_+|_+$/g,``)||`sketch`).slice(0,60)}function Tt(e,t){return{code:e[0]?.content??``,files:e.slice(1).map(e=>({name:e.name,content:e.content})),board:t}}var Et=e=>[`sketch.ino`,...e.slice(1).map(e=>e.name)];function Dt(e,t){return t===`sketch.ino`?0:e.findIndex((e,n)=>n>0&&e.name===t)}function Ot(e){let t=/\bSerial\d?\.begin\s*\(\s*(\d+)/.exec(e.replace(/\/\/[^\n]*/g,``));return t?Number(t[1]):null}function kt(e){let t=[];for(let n of e.matchAll(/^\s*#\s*include\s*<([\w./-]+)\.h>/gm))t.includes(n[1])||t.push(n[1]);return t}var At=[`Arduino`,`Wire`,`SPI`,`EEPROM`,`Servo`,`Stepper`,`SoftwareSerial`,`LiquidCrystal`,`SD`,`Ethernet`,`avr/pgmspace`,`avr/sleep`,`avr/wdt`,`avr/io`,`avr/interrupt`,`WiFi`,`math`,`string`,`stdlib`,`stdio`],jt={DHT:`DHT sensor library`,LiquidCrystal_I2C:`LiquidCrystal I2C`,Adafruit_Sensor:`Adafruit Unified Sensor`,Adafruit_GFX:`Adafruit GFX Library`,Adafruit_SSD1306:`Adafruit SSD1306`,Adafruit_NeoPixel:`Adafruit NeoPixel`,FastLED:`FastLED`,OneWire:`OneWire`,DallasTemperature:`DallasTemperature`,PubSubClient:`PubSubClient`,ArduinoJson:`ArduinoJson`},Mt=e=>jt[e]??e.replace(/_/g,` `);function Nt(e){return e===`nl`?`
`:e===`cr`?`\r`:e===`crnl`?`\r
`:``}function Pt(e){let t=new Date(e),n=(e,t=2)=>String(e).padStart(t,`0`);return`${n(t.getHours())}:${n(t.getMinutes())}:${n(t.getSeconds())}.${n(t.getMilliseconds(),3)}`}var Ft=()=>typeof navigator<`u`?navigator.serial:void 0;function It(){return Ft()!==void 0}var Z=e=>new Promise(t=>setTimeout(t,e)),Lt=class{port=null;reader=null;writer=null;running=!1;onLine;onState;onUnplug=e=>{e.target===this.port&&this.close(`The board was unplugged: the serial monitor is disconnected.`)};constructor(e,t){this.onLine=e,this.onState=t}get isOpen(){return this.port!==null}async open(e,t=!0){let n=Ft();if(!n)throw Error(`This browser has no Web Serial. Use Chrome or Edge to talk to a board.`);let r=await n.requestPort();await r.open({baudRate:e}),this.port=r,this.running=!0,this.reader=r.readable?.getReader()??null,this.writer=r.writable?.getWriter()??null,n.addEventListener?.(`disconnect`,this.onUnplug);let i;if(typeof r.setSignals==`function`)try{t?(await r.setSignals({dataTerminalReady:!1,requestToSend:!1}),await Z(100),await r.setSignals({dataTerminalReady:!0,requestToSend:!0})):await r.setSignals({dataTerminalReady:!1,requestToSend:!1})}catch{i=`This port would not change the DTR line: the board may or may not have restarted.`}else t&&(i=`This browser cannot toggle DTR: the board restarts only if opening the port does it.`);this.onState(!0,i),this.readLoop()}async readLoop(){let e=``,t=new TextDecoder;try{for(;this.running&&this.reader;){let{value:n,done:r}=await this.reader.read();if(r)break;e+=n?t.decode(n,{stream:!0}):``;let i;for(;(i=e.search(/\r?\n|\r(?!$)/))>=0;){let t=e.startsWith(`\r
`,i)?i+2:i+1;this.onLine(e.slice(0,i),Date.now()),e=e.slice(t)}}}catch(e){this.running&&this.close(e instanceof Error?e.message:String(e));return}this.running&&this.close(`The serial port closed.`)}async send(e,t=`nl`){if(!this.writer)throw Error(`The serial port is not open.`);await this.writer.write(new TextEncoder().encode(e+Nt(t)))}async close(e){if(!this.port&&!this.running)return;this.running=!1,Ft()?.removeEventListener?.(`disconnect`,this.onUnplug);let{reader:t,writer:n,port:r}=this;this.reader=null,this.writer=null,this.port=null;try{await t?.cancel()}catch{}try{t?.releaseLock()}catch{}try{n?.releaseLock()}catch{}try{await r?.close()}catch{}this.onState(!1,e)}};function Rt(){let e=(0,T.useRef)(null),[t,n]=(0,T.useState)({w:320,h:180});return(0,T.useEffect)(()=>{let t=e.current;if(!t)return;let r=new ResizeObserver(()=>n({w:Math.max(120,t.clientWidth),h:Math.max(80,t.clientHeight)}));return r.observe(t),()=>r.disconnect()},[]),[e,t]}var zt=e=>Math.abs(e)>=1e3||Number.isInteger(e)?String(Math.round(e*100)/100):e.toPrecision(3).replace(/\.?0+$/,``);function Bt({columns:e,hidden:t,total:n}){let[r,{w:i,h:a}]=Rt(),o=e.filter(e=>!t.has(e.name)),s=1/0,c=-1/0;for(let e of o)for(let t of e.values)Number.isFinite(t)&&(t<s&&(s=t),t>c&&(c=t));let{lo:l,hi:u}=lt(s<=c?{min:s,max:c}:null),d=e[0]?.values.length??0,f=e=>44+(d<=1?0:e/(d-1)*(i-44-8)),p=e=>8+(1-(e-l)/(u-l))*(a-8-16),m=ut(l,u,Math.max(2,Math.floor((a-8-16)/34)));return(0,I.jsxs)(`div`,{className:`ka-chart`,ref:r,children:[(0,I.jsxs)(`svg`,{width:i,height:a,role:`img`,"aria-label":`Serial plotter`,children:[m.map(e=>(0,I.jsxs)(`g`,{children:[(0,I.jsx)(`line`,{x1:44,x2:i-8,y1:p(e),y2:p(e),className:`ka-grid`}),(0,I.jsx)(`text`,{x:39,y:p(e)+3.5,textAnchor:`end`,className:`ka-axis`,children:zt(e)})]},e)),(0,I.jsx)(`line`,{x1:44,x2:44,y1:8,y2:a-16,className:`ka-grid`}),(0,I.jsx)(`text`,{x:44,y:a-3,className:`ka-axis`,children:Math.max(0,n-d)}),(0,I.jsx)(`text`,{x:i-8,y:a-3,textAnchor:`end`,className:`ka-axis`,children:n}),e.map((e,n)=>t.has(e.name)?null:(0,I.jsx)(`path`,{d:L(e.values,f,p),fill:`none`,stroke:st(n),strokeWidth:1.6,strokeLinejoin:`round`},e.name))]}),d===0&&(0,I.jsx)(`div`,{className:`ka-chart-empty k-muted`,children:`Waiting for numbers: 1,2,3 or a:1 b:2 on each line.`})]})}var Vt=(e,t)=>`${t?`[${Pt(e.t)}] `:``}${e.tx?`> `:``}${e.text}`;function Ht(e){let[t,n]=(0,T.useState)(``),r=(0,T.useRef)(null),i=e.entries.slice(-1e3);return(0,T.useEffect)(()=>{let t=r.current;t&&e.autoscroll&&!e.paused&&(t.scrollTop=t.scrollHeight)}),(0,I.jsxs)(`aside`,{className:`ka-serial`,"aria-label":`Serial`,children:[(0,I.jsxs)(`div`,{className:`ka-tabs`,role:`tablist`,children:[(0,I.jsx)(`button`,{role:`tab`,"aria-selected":e.view===`monitor`,className:e.view===`monitor`?`on`:``,onClick:()=>e.onView(`monitor`),children:`Serial monitor`}),(0,I.jsx)(`button`,{role:`tab`,"aria-selected":e.view===`plotter`,className:e.view===`plotter`?`on`:``,onClick:()=>e.onView(`plotter`),children:`Serial plotter`})]}),!e.supported&&(0,I.jsx)(`div`,{className:`ka-note`,children:`Web Serial is not in this browser: use Chrome or Edge to talk to a board.`}),(0,I.jsxs)(`div`,{className:`ka-row`,children:[(0,I.jsx)(`select`,{className:`k-input`,value:e.baud,onChange:t=>e.onBaud(Number(t.target.value)),disabled:e.open,"aria-label":`Baud rate`,children:xt.map(e=>(0,I.jsxs)(`option`,{value:e,children:[e,` baud`]},e))}),e.open?(0,I.jsxs)(`button`,{className:`k-btn`,onClick:e.onDisconnect,children:[(0,I.jsx)(Ce,{size:13}),` Disconnect`]}):(0,I.jsxs)(`button`,{className:`k-btn`,disabled:!e.supported,onClick:e.onConnect,children:[(0,I.jsx)(xe,{size:13}),` Connect…`]})]}),(0,I.jsxs)(`label`,{className:`ka-check`,title:`Pulse the DTR line when connecting: most boards restart, so setup() runs again and the first lines are not missed`,children:[(0,I.jsx)(`input`,{type:`checkbox`,checked:e.resetDtr,onChange:t=>e.onResetDtr(t.target.checked),disabled:e.open}),` Reset the board on connect (DTR)`]}),e.note&&(0,I.jsx)(`div`,{className:`ka-note`,children:e.note}),(0,I.jsxs)(`div`,{className:`ka-row ka-wrap`,children:[(0,I.jsx)(`button`,{className:`k-btn small`,onClick:e.onPause,title:`Freeze the display; data keeps arriving`,children:e.paused?(0,I.jsxs)(I.Fragment,{children:[(0,I.jsx)(re,{size:12}),` Resume`]}):(0,I.jsxs)(I.Fragment,{children:[(0,I.jsx)(ne,{size:12}),` Pause`]})}),(0,I.jsxs)(`button`,{className:`k-btn small`,onClick:e.onClear,children:[(0,I.jsx)(b,{size:12}),` Clear`]}),e.view===`monitor`?(0,I.jsxs)(I.Fragment,{children:[(0,I.jsxs)(`button`,{className:`k-btn small`,onClick:e.onCopy,children:[(0,I.jsx)(ee,{size:12}),` Copy`]}),(0,I.jsxs)(`button`,{className:`k-btn small`,onClick:e.onSave,children:[(0,I.jsx)(o,{size:12}),` Save log`]}),(0,I.jsxs)(`label`,{className:`ka-check`,children:[(0,I.jsx)(`input`,{type:`checkbox`,checked:e.timestamps,onChange:t=>e.onTimestamps(t.target.checked)}),` Timestamps`]}),(0,I.jsxs)(`label`,{className:`ka-check`,children:[(0,I.jsx)(`input`,{type:`checkbox`,checked:e.autoscroll,onChange:t=>e.onAutoscroll(t.target.checked)}),` Autoscroll`]})]}):(0,I.jsxs)(`button`,{className:`k-btn small`,onClick:e.onSaveCsv,disabled:!e.columns.length,children:[(0,I.jsx)(o,{size:12}),` Save CSV`]})]}),e.view===`monitor`?(0,I.jsxs)(I.Fragment,{children:[(0,I.jsx)(`pre`,{className:`ka-log`,ref:r,"aria-label":`Serial output`,children:i.length?i.map(t=>Vt(t,e.timestamps)).join(`
`):`Nothing received yet.`}),(0,I.jsxs)(`form`,{className:`ka-row`,onSubmit:r=>{r.preventDefault(),e.open&&(e.onSend(t),n(``))},children:[(0,I.jsx)(`input`,{className:`k-input`,value:t,onChange:e=>n(e.target.value),placeholder:e.open?`Send a line`:`Connect first`,disabled:!e.open,"aria-label":`Line to send`}),(0,I.jsxs)(`select`,{className:`k-input ka-ending`,value:e.ending,onChange:t=>e.onEnding(t.target.value),"aria-label":`Line ending`,children:[(0,I.jsx)(`option`,{value:`none`,children:`No line ending`}),(0,I.jsx)(`option`,{value:`nl`,children:`Newline`}),(0,I.jsx)(`option`,{value:`cr`,children:`Carriage return`}),(0,I.jsx)(`option`,{value:`crnl`,children:`Both NL & CR`})]}),(0,I.jsx)(`button`,{className:`k-icon-btn`,disabled:!e.open,"aria-label":`Send`,children:(0,I.jsx)(_,{size:13})})]})]}):(0,I.jsxs)(I.Fragment,{children:[(0,I.jsx)(`div`,{className:`ka-legend`,children:e.columns.map((t,n)=>(0,I.jsxs)(`button`,{className:`ka-series${e.hidden.has(t.name)?` off`:``}`,onClick:()=>e.onToggleSeries(t.name),title:`Show or hide this series`,children:[(0,I.jsx)(`span`,{className:`ka-swatch`,style:{background:st(n)}}),` `,t.name,!e.hidden.has(t.name)&&Ut(t)!==null&&(0,I.jsxs)(`span`,{className:`k-muted`,children:[` `,Ut(t)]})]},t.name))}),(0,I.jsx)(Bt,{columns:e.columns,hidden:e.hidden,total:e.total})]}),(0,I.jsx)(`div`,{className:`ka-hint k-muted`,children:`The web page can read the board but cannot flash it. Use Upload (the board must be plugged into the computer the KherveOS server runs on) or the Arduino IDE.`})]})}function Ut(e){for(let t=e.values.length-1;t>=0;t--)if(Number.isFinite(e.values[t]))return String(Math.round(e.values[t]*1e3)/1e3);return null}var Wt=e=>({ok:!1,cli:!0,output:e instanceof u&&e.status===401?`Sign in to KherveOS to compile: the compiler runs on the server.`:e instanceof Error?e.message:String(e),diagnostics:[],size:null});async function Gt(e,t,n,r){try{let i={...Tt(t,n),...e===`upload`&&r?{port:r}:{}};return Fe(await a(`/arduino/${e}`,{method:`POST`,body:i}),Et(t))}catch(e){return Wt(e)}}var Kt=()=>a(`/arduino/status`).catch(()=>null);async function qt(){try{let e=await a(`/arduino/boards`);return e.source===`cli`?e.boards:[]}catch{return[]}}async function Jt(){try{return await a(`/arduino/libraries`)}catch(e){return{libraries:[],cli:!0,output:e instanceof Error?e.message:String(e)}}}async function Yt(e){try{return await a(`/arduino/libraries/search`,{method:`POST`,body:{query:e}})}catch(e){return{libraries:[],cli:!0,output:e instanceof Error?e.message:String(e)}}}async function Xt(e,t){try{return await a(e,{method:`POST`,body:t})}catch(e){return{ok:!1,cli:!0,output:e instanceof Error?e.message:String(e)}}}var Zt=e=>Xt(`/arduino/libraries/install`,{name:e}),Qt=e=>Xt(`/arduino/core/install`,{core:e});function $t({needed:e,seed:t}){let[n,r]=(0,T.useState)(``),[i,a]=(0,T.useState)(null),[o,s]=(0,T.useState)([]),[c,u]=(0,T.useState)(null),[d,f]=(0,T.useState)(null),p=(0,T.useCallback)(async()=>{let e=await Jt();s(e.libraries),e.cli===!1?u(`arduino-cli is not installed on the KherveOS server: libraries cannot be managed from here.`):e.output&&u(e.output)},[]);(0,T.useEffect)(()=>{p()},[p]);let m=(0,T.useCallback)(async e=>{if(!e.trim())return;f(`search`),u(null);let t=await Yt(e.trim());f(null),a(t.libraries),t.output?u(t.output):t.libraries.length||u(`No library found.`)},[]);(0,T.useEffect)(()=>{t.n!==0&&t.query&&(r(t.query),m(t.query))},[t,m]);let h=async e=>{if(!await l.dialog.confirm(`Install the library “${e}” on the KherveOS server? It becomes available to every user of this server.`,{title:`Install library`,okLabel:`Install`}))return;f(e);let t=await Zt(e);f(null),u(t.ok?`Installed ${e}.`:t.output),p()},g=new Set(o.map(e=>e.name.toLowerCase()));return(0,I.jsxs)(`div`,{className:`ka-libs`,children:[(0,I.jsxs)(`form`,{className:`ka-row`,onSubmit:e=>{e.preventDefault(),m(n)},children:[(0,I.jsx)(`input`,{className:`k-input`,value:n,onChange:e=>r(e.target.value),placeholder:`Search libraries`,"aria-label":`Search libraries`}),(0,I.jsx)(`button`,{className:`k-icon-btn`,"aria-label":`Search`,disabled:d===`search`,children:(0,I.jsx)(le,{size:13})})]}),c&&(0,I.jsx)(`div`,{className:`ka-note`,children:c}),e.length>0&&(0,I.jsxs)(`div`,{className:`ka-libgroup`,children:[(0,I.jsx)(`div`,{className:`ka-subtitle`,children:`This sketch needs`}),e.map(e=>(0,I.jsxs)(`div`,{className:`ka-lib`,children:[(0,I.jsx)(`span`,{className:`ka-lib-name`,children:e}),g.has(e.toLowerCase())?(0,I.jsx)(`span`,{className:`k-muted`,children:`installed`}):(0,I.jsx)(`button`,{className:`k-btn small`,disabled:d!==null,onClick:()=>void h(e),children:d===e?`…`:`Install`})]},e))]}),i&&(0,I.jsxs)(`div`,{className:`ka-libgroup`,children:[(0,I.jsx)(`div`,{className:`ka-subtitle`,children:`Results`}),i.map(e=>(0,I.jsxs)(`div`,{className:`ka-lib`,title:e.sentence,children:[(0,I.jsxs)(`span`,{className:`ka-lib-name`,children:[e.name,(0,I.jsxs)(`span`,{className:`k-muted`,children:[` `,e.version]}),(0,I.jsx)(`span`,{className:`ka-lib-sentence k-muted`,children:e.sentence})]}),g.has(e.name.toLowerCase())?(0,I.jsx)(`span`,{className:`k-muted`,children:`installed`}):(0,I.jsx)(`button`,{className:`k-btn small`,disabled:d!==null,onClick:()=>void h(e.name),children:d===e.name?`…`:`Install`})]},e.name))]}),(0,I.jsxs)(`div`,{className:`ka-libgroup`,children:[(0,I.jsxs)(`div`,{className:`ka-subtitle`,children:[`Installed on the server (`,o.length,`)`]}),o.map(e=>(0,I.jsx)(`div`,{className:`ka-lib`,children:(0,I.jsxs)(`span`,{className:`ka-lib-name`,children:[e.name,(0,I.jsxs)(`span`,{className:`k-muted`,children:[` `,e.version]})]})},e.name)),!o.length&&(0,I.jsx)(`div`,{className:`k-muted`,children:`None listed.`})]})]})}function en({tab:e,onTab:t,current:n,onExample:r,onSnippet:i,needed:a,seed:o}){let[s,c]=(0,T.useState)(``),l=(0,T.useMemo)(()=>{let e=s.trim().toLowerCase();return $e.map(t=>({category:t,items:F.filter(n=>n.category===t&&(!e||`${n.title} ${n.description} ${n.category}`.toLowerCase().includes(e)))})).filter(e=>e.items.length)},[s]);return(0,I.jsxs)(`aside`,{className:`ka-side`,"aria-label":`Examples and libraries`,children:[(0,I.jsx)(`div`,{className:`ka-tabs`,role:`tablist`,children:[`examples`,`snippets`,`libraries`].map(n=>(0,I.jsx)(`button`,{role:`tab`,"aria-selected":e===n,className:e===n?`on`:``,onClick:()=>t(n),children:n===`examples`?`Examples`:n===`snippets`?`Snippets`:`Libraries`},n))}),e===`examples`&&(0,I.jsxs)(I.Fragment,{children:[(0,I.jsxs)(`label`,{className:`ka-search`,children:[(0,I.jsx)(le,{size:12}),(0,I.jsx)(`input`,{className:`k-input`,value:s,onChange:e=>c(e.target.value),placeholder:`Filter examples`,"aria-label":`Filter examples`})]}),(0,I.jsxs)(`div`,{className:`ka-list`,children:[l.map(e=>(0,I.jsxs)(`div`,{children:[(0,I.jsx)(`div`,{className:`ka-subtitle`,children:e.category}),e.items.map(e=>(0,I.jsxs)(`button`,{className:`ka-item${n===e.id?` on`:``}`,onClick:()=>r(e),title:e.description,children:[(0,I.jsx)(`span`,{children:e.title}),(0,I.jsx)(`span`,{className:`k-muted`,children:e.description})]},e.id))]},e.category)),!l.length&&(0,I.jsx)(`div`,{className:`k-muted ka-pad`,children:`No example matches.`})]})]}),e===`snippets`&&(0,I.jsxs)(`div`,{className:`ka-list`,children:[(0,I.jsx)(`div`,{className:`k-muted ka-pad`,children:`Click a snippet to insert it at the cursor.`}),nt.map(e=>(0,I.jsx)(`button`,{className:`ka-item`,onClick:()=>i(e),title:e.code,children:(0,I.jsx)(`span`,{children:e.title})},e.id))]}),e===`libraries`&&(0,I.jsx)(`div`,{className:`ka-list`,children:(0,I.jsx)($t,{needed:a,seed:o})})]})}var Q=34,tn=38,nn=16;function rn({family:e,report:t}){let n=yt(e);if(!n.length)return(0,I.jsx)(`div`,{className:`k-muted ka-pinout-none`,children:`No pin drawing for this board: the pins found in the code are listed below.`});let r=new Map(t.pins.map(e=>[e.pin,e])),i=4,a=n.map(e=>{let t=i,n=Math.ceil(e.pins.length/nn);return i+=14+n*41+6,{g:e,top:t}});return(0,I.jsx)(`svg`,{className:`ka-pinout`,viewBox:`0 0 596 ${i}`,role:`img`,"aria-label":`Board pinout`,children:a.map(({g:e,top:t})=>(0,I.jsxs)(`g`,{children:[(0,I.jsx)(`text`,{x:4,y:t+9,className:`ka-pin-title`,children:e.title}),e.pins.map((e,n)=>{let i=2+n%nn*37,a=t+14+Math.floor(n/nn)*41,o=r.get(e.id),s=[...e.pwm?[`~`]:[],...e.tags.filter(e=>e!==`PWM`)].join(` `);return(0,I.jsxs)(`g`,{className:`ka-pin${o?` used`:``}${o?.roles.length===1&&o.roles[0]===`bus`?` bus`:``}`,children:[(0,I.jsxs)(`title`,{children:[e.id,e.tags.length?` (${e.tags.join(`, `)})`:``,o?` — ${o.roles.map(e=>X[e]).join(`, `)}, line ${o.lines.join(`, `)}`:``]}),(0,I.jsx)(`rect`,{x:i,y:a,width:Q,height:tn,rx:4}),(0,I.jsx)(`text`,{x:i+Q/2,y:a+16,textAnchor:`middle`,className:`ka-pin-num`,children:e.label}),(0,I.jsx)(`text`,{x:i+Q/2,y:a+29,textAnchor:`middle`,className:`ka-pin-tag`,children:s})]},e.id)})]},e.title))})}function an({open:e,onToggle:t,example:r,report:i,family:a,boardName:o,onLibrary:s}){return(0,I.jsxs)(`section`,{className:`ka-wiring`,"aria-label":`Wiring`,children:[(0,I.jsxs)(`button`,{className:`ka-wiring-head`,onClick:t,"aria-expanded":e,children:[e?(0,I.jsx)(h,{size:14}):(0,I.jsx)(n,{size:14}),` Wiring and pins`,(0,I.jsxs)(`span`,{className:`k-muted`,children:[` `,i.pins.length?`${i.pins.length} pin${i.pins.length>1?`s`:``} used`:`no pins used yet`,i.warnings.length?`, ${i.warnings.length} warning${i.warnings.length>1?`s`:``}`:``]})]}),e&&(0,I.jsxs)(`div`,{className:`ka-wiring-body`,children:[(0,I.jsxs)(`div`,{className:`ka-wiring-text`,children:[r?(0,I.jsxs)(I.Fragment,{children:[(0,I.jsx)(`div`,{className:`ka-subtitle`,children:r.title}),(0,I.jsx)(`p`,{className:`ka-wiring-desc`,children:r.description}),(0,I.jsx)(`pre`,{className:`ka-wiring-pre`,children:r.wiring}),r.libraries.length>0&&(0,I.jsxs)(`div`,{className:`ka-chips`,children:[(0,I.jsx)(`span`,{className:`k-muted`,children:`Libraries:`}),r.libraries.map(e=>(0,I.jsx)(`button`,{className:`ka-chip`,onClick:()=>s(e),title:`Find it in Libraries`,children:e},e))]})]}):(0,I.jsxs)(`div`,{className:`k-muted`,children:[`Open an example to see how it is wired. The board drawing shows the pins your code uses (`,o,`).`]}),i.pins.length>0&&(0,I.jsx)(`ul`,{className:`ka-pinlist`,children:i.pins.map(e=>(0,I.jsxs)(`li`,{children:[(0,I.jsx)(`b`,{children:e.pin.startsWith(`D`)?e.pin.slice(1):e.pin}),` `,e.roles.map(e=>X[e]).join(`, `),` `,(0,I.jsxs)(`span`,{className:`k-muted`,children:[`line `,e.lines.join(`, `)]})]},e.pin))}),i.warnings.map(e=>(0,I.jsx)(`div`,{className:`ka-note`,children:e},e))]}),(0,I.jsxs)(`div`,{className:`ka-wiring-board`,children:[(0,I.jsx)(rn,{family:a,report:i}),(0,I.jsx)(`div`,{className:`ka-legend-pins k-muted`,children:`~ PWM · INT interrupt · lit pins are used by the code`})]})]})]})}var $=`${y}/Documents/kArduino`,on=`kos.karduino.board`,sn=2e3,cn=60;function ln(){try{let e=localStorage.getItem(on);if(e&&O(e))return e}catch{}return Ee}function un(e){try{localStorage.setItem(on,e)}catch{}}var dn=e=>e instanceof Error?e.message:String(e),fn=e=>e.endsWith(`.h`)||e.endsWith(`.hpp`)?`#pragma once
`:e.endsWith(`.ino`)?``:`#include <Arduino.h>
`;function pn({win:e,args:t}){let n=et(`blink`),[r,i]=(0,T.useState)(`blink`),[a,o]=(0,T.useState)(n.code),[u,f]=(0,T.useState)([]),[h,g]=(0,T.useState)(0),[ee,ne]=(0,T.useState)(null),[_,v]=(0,T.useState)(!1),[y,le]=(0,T.useState)(n),[b,me]=(0,T.useState)(ln),[x,he]=(0,T.useState)(()=>!De(ln())),[ge,_e]=(0,T.useState)([]),[S,ve]=(0,T.useState)(void 0),[C,ye]=(0,T.useState)(null),[w,xe]=(0,T.useState)(null),[Se,Ce]=(0,T.useState)([]),[E,Ee]=(0,T.useState)(``),[D,k]=(0,T.useState)(!0),[je,Me]=(0,T.useState)(`examples`),[A,j]=(0,T.useState)(!0),[Ne,Pe]=(0,T.useState)(!1),[Fe,Le]=(0,T.useState)({query:``,n:0}),[M,Re]=(0,T.useState)(`l`),[ze,Be]=(0,T.useState)(9600),[Ve,He]=(0,T.useState)(!1),[Ue,N]=(0,T.useState)(null),[We,Ge]=(0,T.useState)(`monitor`),[Ke,qe]=(0,T.useState)(!1),[Je,P]=(0,T.useState)(!0),[it,at]=(0,T.useState)(`nl`),[ot,st]=(0,T.useState)(!0),[lt,ut]=(0,T.useState)(new Set),[L,dt]=(0,T.useState)(null),[,ft]=(0,T.useState)(0),R=(0,T.useRef)([]),z=(0,T.useRef)(new ct),pt=(0,T.useRef)(null),B=(0,T.useRef)(null),mt=(0,T.useRef)(!1),V=(0,T.useRef)(null),H=(0,T.useRef)(null),U=(0,T.useRef)(null),W=r||`sketch`,G=(0,T.useMemo)(()=>[{name:`${W}.ino`,content:a},...u],[W,a,u]),ht=G[Math.min(h,G.length-1)],gt=ke(b),_t=(0,T.useMemo)(()=>vt(G.map(e=>e.content).join(`
`),gt),[G,gt]),K=(0,T.useRef)({dirty:_,all:G,board:b,dir:ee,stem:W});K.current={dirty:_,all:G,board:b,dir:ee,stem:W},(0,T.useEffect)(()=>{e.setTitle(`kArduino — ${W}.ino${_?` •`:``}`)},[e,W,_]),(0,T.useEffect)(()=>{let e=V.current;if(!e)return;let t=!0,n=new ResizeObserver(()=>{let n=e.clientWidth;Re(n<760?`s`:n<1e3?`m`:`l`),t&&n>0&&(t=!1,k(n>=1e3),j(n>=760))});return n.observe(e),()=>n.disconnect()},[]);let q=(0,T.useCallback)(()=>{Kt().then(ve)},[]);(0,T.useEffect)(()=>{q()},[q]),(0,T.useEffect)(()=>{x&&!ge.length&&qt().then(_e)},[x,ge.length]);let J=(0,T.useCallback)(e=>{me(e),un(e),he(!De(e))},[]),Y=(0,T.useCallback)(async e=>{xe(e),ye(null);let t=await Gt(e,K.current.all,K.current.board,e===`upload`&&E?E:void 0);return ye(t),xe(null),t.ports&&Ce(t.ports.map(e=>e.address)),t.uploaded&&l.notify({title:`Uploaded`,body:`${K.current.stem}.ino to ${t.port??`the board`}`}),t},[E]),yt=async e=>{if(!await l.dialog.confirm(`Install the board package “${e}” on the KherveOS server? Downloading it can take a few minutes.`,{title:`Install board package`,okLabel:`Install`}))return!1;let t=await Qt(e);return q(),t.ok||await l.dialog.alert(t.output,{title:`Board package`}),t.ok},X=async()=>!K.current.dirty||l.dialog.confirm(`This sketch has changes that are not saved. Continue and lose them?`,{title:`Unsaved changes`,okLabel:`Continue`,danger:!0}),St=(t,n,r,a,s)=>{i(t),o(n),f(r),g(0),ne(a),v(!1),le(s),ye(null),e.setDocumentPath(a?`${a}/${t}.ino`:null)},Tt=async()=>{await X()&&St(`sketch`,tt,[],null,null)},Et=async e=>await X()?(St(wt(e.id.replace(/-/g,`_`)),e.code,[],null,e),J(e.board),Pe(!0),!0):!1,jt=async(e,t)=>{try{let n=wt(t),r=await s.readText(`${e}/${t}`),i=[];for(let r of s.list(e)){let e=oe(r.name).toLowerCase();r.type===`file`&&r.name!==t&&bt.includes(e)&&!Ct(r.name,i.map(e=>e.name),`${n}.ino`)&&(i.length>=11||r.size>1e5||i.push({name:r.name,content:await s.readText(r.path)}))}St(n,r,i,e,null)}catch(e){await l.dialog.alert(`Could not open the sketch: ${dn(e)}`)}},Nt=async e=>{if(!e){if(!await X())return;e=await l.dialog.openFile({extensions:[`.ino`],startDir:s.isDir($)?$:void 0})??void 0}if(!e)return;let t=ce(e),n=se(e);if(se(t)===n.replace(/\.ino$/i,``))await jt(t,n);else try{St(wt(n),await s.readText(e),[],null,null)}catch(e){await l.dialog.alert(`Could not open the sketch: ${dn(e)}`)}},Pt=async e=>{if(!e){if(!await X())return;e=await l.dialog.pickFolder({title:`Open a sketch folder`,startDir:s.isDir($)?$:void 0})??void 0}if(!e)return;let t=s.list(e).filter(e=>e.type===`file`&&e.name.toLowerCase().endsWith(`.ino`)).map(e=>e.name),n=`${se(e)}.ino`,r=t.includes(n)?n:t[0];if(!r){await l.dialog.alert(`There is no .ino file in this folder.`);return}await jt(e,r)},Ft=async(t,n)=>{await s.mkdir(t,{recursive:!0});let r=K.current.all;await s.writeText(`${t}/${n}.ino`,r[0].content);for(let e of r.slice(1))await s.writeText(`${t}/${e.name}`,e.content);return ne(t),v(!1),e.setDocumentPath(`${t}/${n}.ino`),l.notify({title:`Sketch saved`,body:ae(`${t}/${n}.ino`)}),`${t}/${n}.ino`},Z=async()=>{let{dir:e,stem:t}=K.current,n=e&&se(e)===t?e:`${$}/${t}`;return Ft(n,t)},Rt=async()=>{let e=await l.dialog.prompt(`Name of the sketch (a folder with this name is made in Documents/kArduino):`,{title:`Save sketch as`,defaultValue:K.current.stem,okLabel:`Save`});if(e===null)return;let t=wt(e),n=`${$}/${t}`;(!s.exists(n)||await l.dialog.confirm(`“${t}” already exists. Replace its files?`,{okLabel:`Replace`,danger:!0}))&&(i(t),await Ft(n,t))};(0,T.useEffect)(()=>{t.path&&s.exists(t.path)&&(s.isDir(t.path)?Pt(t.path):Nt(t.path))},[t.path]);let zt=(e,t)=>{e===0?o(t):f(n=>n.map((n,r)=>r===e-1?{...n,content:t}:n)),v(!0)},Bt=async e=>{if(G.length>=12)return await l.dialog.alert(`A sketch can have 12 files at most.`),!1;let t=e??await l.dialog.prompt(`Name of the new file (.h, .cpp, .c, .hpp or .ino):`,{title:`New file`,defaultValue:`helpers.h`,okLabel:`Add`});if(t==null)return!1;let n=Ct(t.trim(),u.map(e=>e.name),`${W}.ino`);return n?(await l.dialog.alert(n,{title:`“${t}” cannot be used`}),!1):(f(e=>[...e,{name:t.trim(),content:fn(t.trim())}]),g(G.length),v(!0),!0)},Ut=async e=>{if(e===0){let e=await l.dialog.prompt(`Name of the sketch:`,{title:`Rename sketch`,defaultValue:W});e!==null&&(i(wt(e)),v(!0));return}let t=G[e].name,n=await l.dialog.prompt(`New name of the file:`,{title:`Rename file`,defaultValue:t});if(n===null||n.trim()===t)return;let r=Ct(n.trim(),u.map(e=>e.name).filter(e=>e!==t),`${W}.ino`);if(r){await l.dialog.alert(r,{title:`“${n}” cannot be used`});return}f(t=>t.map((t,r)=>r===e-1?{...t,name:n.trim()}:t)),v(!0)},Wt=async e=>{e!==0&&await l.dialog.confirm(`Remove “${G[e].name}” from the sketch?`,{okLabel:`Remove`,danger:!0})&&(f(t=>t.filter((t,n)=>n!==e-1)),g(t=>t>=e?Math.max(0,t-1):t),v(!0))},Jt=G.map(e=>e.name).join(`|`);(0,T.useEffect)(()=>{let e=H.current;e&&Xe(e,(C?.diagnostics??[]).filter(e=>!e.external&&Dt(G,e.file)===h).map(e=>({line:e.line,severity:e.severity,message:e.message})))},[C,h,Jt]),(0,T.useEffect)(()=>{let e=H.current;e&&U.current&&(Ze(e,U.current.line,U.current.col),U.current=null)},[h]);let Yt=e=>{if(e.external)return;let t=Dt(G,e.file);t<0||(t===h&&H.current?Ze(H.current,e.line,e.col):(U.current={line:e.line,col:e.col},g(t)))},Xt=e=>{let t=H.current;t&&Qe(t,e.code)},Zt=()=>{pt.current||=setTimeout(()=>{pt.current=null,ft(e=>e+1)},cn)};(0,T.useEffect)(()=>(B.current=new Lt((e,t)=>{R.current.push({t,text:e}),R.current.length>sn&&R.current.splice(0,R.current.length-sn),z.current.pushLine(e),Zt()},(e,t)=>{He(e),N(t??null)}),()=>{B.current?.close(),B.current=null,pt.current&&clearTimeout(pt.current)}),[]),(0,T.useEffect)(()=>{let e=Ot(a);e&&xt.includes(e)&&!mt.current&&!Ve&&Be(e)},[a,Ve]);let $t=async()=>{N(null);try{await B.current?.open(ze,ot)}catch(e){N(dn(e))}},Q=async(e,t=it)=>{try{await B.current?.send(e,t),R.current.push({t:Date.now(),text:e,tx:!0}),Zt()}catch(e){N(dn(e))}},tn=()=>{R.current=[],z.current.clear(),dt(e=>e&&{entries:[],columns:[],total:0}),ft(e=>e+1)},nn=()=>{dt(e=>e?null:{entries:[...R.current],columns:z.current.columns(),total:z.current.total})},rn=async()=>{let e=R.current.map(e=>Vt(e,Ke)).join(`
`);try{await navigator.clipboard.writeText(e),l.notify({title:`Serial log copied`,body:`${R.current.length} lines`})}catch{await l.dialog.alert(`The browser would not let kArduino copy: use Save log instead.`)}},on=async()=>{let e=await l.dialog.saveFile({defaultName:`serial-log.txt`,extensions:[`.txt`,`.log`],startDir:$});e&&(await s.writeText(e,R.current.map(e=>Vt(e,Ke)).join(`
`)+`
`,{mkdirs:!0}),l.notify({title:`Serial log saved`,body:ae(e)}))},pn=async()=>{let e=await l.dialog.saveFile({defaultName:`plot.csv`,extensions:[`.csv`],startDir:$});e&&(await s.writeText(e,z.current.toCsv(),{mkdirs:!0}),l.notify({title:`Plot saved`,body:ae(e)}))},mn=e=>{Ge(e),j(!0)};pe(e,we({get:()=>({name:W,board:b,code:a,files:G.map(e=>e.name),lines:R.current.slice(-50).map(e=>e.text),open:Ve,dirty:_}),setCode:e=>{o(e),g(0),v(!0)},compile:()=>Y(`compile`),save:()=>Z(),send:e=>Q(e),examples:()=>F.map(e=>({id:e.id,title:e.title,category:e.category,description:e.description})),loadExample:async e=>{let t=et(e);if(!t)throw Error(`No example “${e}”: call load_example without an id to list them.`);return{loaded:await Et(t),title:t.title,board:t.board,libraries:t.libraries,wiring:t.wiring}},upload:()=>Y(`upload`),setBoard:e=>{let t=Te.find(t=>t.fqbn===e||t.id===e.toLowerCase()||t.name.toLowerCase()===e.toLowerCase())?.fqbn??e;if(!O(t))throw Error(`“${e}” is not a board: use a name such as “Arduino Uno” or a full name like arduino:avr:uno.`);return J(t),t},addFile:async(e,t)=>{let n=Ct(e,u.map(e=>e.name),`${W}.ino`);if(n)throw Error(`“${e}” cannot be used: ${n}`);if(G.length>=12)throw Error(`A sketch can have 12 files at most.`);if(t.length>1e5)throw Error(`The file is too big.`);f(n=>[...n,{name:e,content:t}]),v(!0)}})),(0,T.useEffect)(()=>(e.setCloseGuard(async()=>{if(!K.current.dirty)return!0;let e=await l.dialog.choose(`Save the changes to “${K.current.stem}.ino” before closing?`,[{label:`Cancel`,value:`cancel`},{label:`Don't save`,value:`discard`,danger:!0},{label:`Save`,value:`save`,primary:!0}],{title:`Unsaved changes`});if(e===`save`)try{return await Z(),!0}catch{return!1}return e===`discard`}),()=>e.setCloseGuard(null)),[e]);let hn=e=>{if(!(e.metaKey||e.ctrlKey)||e.altKey)return;let t=e.key.toLowerCase();t===`r`&&!e.shiftKey?(e.preventDefault(),Y(`compile`)):t===`u`&&!e.shiftKey?(e.preventDefault(),Y(`upload`)):t===`s`?(e.preventDefault(),e.shiftKey?Rt():Z()):t===`m`&&e.shiftKey&&(e.preventDefault(),mn(`monitor`))};(0,T.useEffect)(()=>{let t=[{label:`File`,items:[{label:`New`,icon:de,onClick:()=>void Tt()},{label:`Open…`,icon:te,onClick:()=>void Nt()},{label:`Open sketch folder…`,onClick:()=>void Pt()},`-`,{label:`Save`,icon:ie,shortcut:`⌘S`,onClick:()=>void Z()},{label:`Save As…`,shortcut:`⇧⌘S`,onClick:()=>void Rt()},`-`,{label:`Close`,onClick:()=>e.close()}]},{label:`Sketch`,items:[{label:`Compile`,icon:re,shortcut:`⌘R`,disabled:w!==null,onClick:()=>void Y(`compile`)},{label:`Upload`,icon:ue,shortcut:`⌘U`,disabled:w!==null,onClick:()=>void Y(`upload`)},`-`,{label:`Examples`,icon:d,submenu:$e.map(e=>({label:e,submenu:F.filter(t=>t.category===e).map(e=>({label:e.title,checked:y?.id===e.id,onClick:()=>void Et(e)}))}))},{label:`Insert snippet`,submenu:nt.map(e=>({label:e.title,onClick:()=>Xt(e)}))},`-`,{label:`Add file…`,icon:fe,onClick:()=>void Bt()}]},{label:`Tools`,items:[{label:`Board`,icon:p,submenu:[...Te.map(e=>({label:e.name,checked:b===e.fqbn,onClick:()=>J(e.fqbn)})),`-`,{label:`Other…`,checked:x,onClick:()=>{he(!0),l.dialog.prompt(`Full board name (fqbn), e.g. arduino:avr:uno:`,{title:`Board`,defaultValue:b}).then(e=>{e&&O(e.trim())&&J(e.trim())})}}]},`-`,{label:`Serial monitor`,icon:m,shortcut:`⇧⌘M`,onClick:()=>mn(`monitor`)},{label:`Serial plotter`,onClick:()=>mn(`plotter`)},`-`,{label:`Manage libraries…`,onClick:()=>{k(!0),Me(`libraries`)}}]},{label:`View`,items:[{label:`Examples and libraries`,checked:D,onClick:()=>k(e=>!e)},{label:`Serial panel`,checked:A,onClick:()=>j(e=>!e)},{label:`Wiring and pins`,checked:Ne,onClick:()=>Pe(e=>!e)}]}];e.setMenus(t)});let gn=C&&!C.ok&&Ie(C.diagnostics)>0,_n=(0,T.useMemo)(()=>{let e=[...y?.libraries??[]],t=new Set(G.map(e=>e.name.replace(/\.\w+$/,``)));for(let n of G)for(let r of kt(n.content)){let n=Mt(r);At.includes(r)||r.includes(`/`)||t.has(r)||e.some(e=>e.toLowerCase()===n.toLowerCase())||e.push(n)}return e},[G,y]),vn=S?.cli&&!S.cores.some(e=>e.id===Oe(b)),yn=L?L.columns:z.current.columns(),bn=L?L.entries:R.current,xn=M===`s`?void 0:[D?`210px`:``,`minmax(0, 1fr)`,A?`340px`:``].filter(Boolean).join(` `);return(0,I.jsxs)(`div`,{className:`k-app ka-app`,ref:V,"data-size":M,onKeyDown:hn,children:[(0,I.jsxs)(`div`,{className:`k-toolbar ka-toolbar`,children:[(0,I.jsx)(`button`,{className:`k-icon-btn`,"aria-label":`New sketch`,title:`New`,onClick:()=>void Tt(),children:(0,I.jsx)(de,{size:14})}),(0,I.jsx)(`button`,{className:`k-icon-btn`,"aria-label":`Open sketch`,title:`Open…`,onClick:()=>void Nt(),children:(0,I.jsx)(te,{size:14})}),(0,I.jsx)(`button`,{className:`k-icon-btn`,"aria-label":`Save sketch`,title:`Save (⌘S)`,onClick:()=>void Z(),children:(0,I.jsx)(ie,{size:14})}),(0,I.jsx)(`span`,{className:`k-sep`}),(0,I.jsxs)(`label`,{className:`ka-field`,children:[`Sketch`,(0,I.jsx)(`input`,{className:`k-input ka-name`,value:r,onChange:e=>{i(e.target.value.replace(/[^A-Za-z0-9_-]/g,`_`)),v(!0)},"aria-label":`Sketch name`})]}),(0,I.jsxs)(`label`,{className:`ka-field`,children:[`Board`,(0,I.jsxs)(`select`,{className:`k-input ka-boardsel`,value:x?`__other`:b,onChange:e=>e.target.value===`__other`?he(!0):J(e.target.value),"aria-label":`Board`,children:[Te.map(e=>(0,I.jsx)(`option`,{value:e.fqbn,children:e.name},e.fqbn)),(0,I.jsx)(`option`,{value:`__other`,children:`Other…`})]})]}),x&&(0,I.jsxs)(I.Fragment,{children:[(0,I.jsx)(`input`,{className:`k-input ka-board`,value:b,list:`ka-boards`,spellCheck:!1,"aria-label":`Board (fully qualified name)`,placeholder:`vendor:arch:board`,onChange:e=>{me(e.target.value),O(e.target.value)&&un(e.target.value)}}),(0,I.jsx)(`datalist`,{id:`ka-boards`,children:ge.map(e=>(0,I.jsx)(`option`,{value:e.fqbn,children:e.name},e.fqbn))})]}),(0,I.jsx)(`span`,{className:`k-sep`}),(0,I.jsxs)(`button`,{className:`k-btn primary`,disabled:w!==null||!O(b),onClick:()=>void Y(`compile`),title:`Compile (⌘R)`,children:[(0,I.jsx)(re,{size:13}),` `,w===`compile`?`Compiling…`:`Compile`]}),(0,I.jsxs)(`button`,{className:`k-btn`,disabled:w!==null||!O(b),onClick:()=>void Y(`upload`),title:`Upload to a board plugged into the server's computer (⌘U)`,children:[(0,I.jsx)(ue,{size:13}),` `,w===`upload`?`Uploading…`:`Upload`]}),Se.length>1&&(0,I.jsxs)(`select`,{className:`k-input ka-port`,value:E,onChange:e=>Ee(e.target.value),"aria-label":`Port of the board on the server`,children:[(0,I.jsx)(`option`,{value:``,children:`Port: automatic`}),Se.map(e=>(0,I.jsx)(`option`,{value:e,children:e},e))]}),(0,I.jsx)(`span`,{className:`k-spacer`}),(0,I.jsx)(`button`,{className:`k-icon-btn${D?` active`:``}`,"aria-label":`Examples and libraries`,title:`Examples, snippets and libraries`,onClick:()=>k(e=>!e),children:(0,I.jsx)(d,{size:14})}),(0,I.jsx)(`button`,{className:`k-icon-btn${A?` active`:``}`,"aria-label":`Serial panel`,title:`Serial monitor and plotter`,onClick:()=>j(e=>!e),children:(0,I.jsx)(m,{size:14})})]}),vn&&(0,I.jsxs)(`div`,{className:`ka-banner`,children:[`The KherveOS server has no board package for `,(0,I.jsx)(`b`,{children:Oe(b)}),`: compiling will fail.`,(0,I.jsxs)(`button`,{className:`k-btn small`,onClick:()=>void yt(Oe(b)),children:[`Install `,Oe(b)]})]}),(0,I.jsxs)(`div`,{className:`ka-body`,style:xn?{gridTemplateColumns:xn}:void 0,children:[D&&(0,I.jsx)(en,{tab:je,onTab:Me,current:y?.id??null,onExample:e=>void Et(e),onSnippet:Xt,needed:_n,seed:Fe}),(0,I.jsxs)(`section`,{className:`ka-edit`,children:[(0,I.jsxs)(`div`,{className:`ka-filetabs`,role:`tablist`,children:[G.map((e,t)=>(0,I.jsxs)(`div`,{role:`tab`,"aria-selected":t===h,className:`ka-filetab${t===h?` on`:``}`,children:[(0,I.jsx)(`button`,{className:`ka-filetab-name`,onClick:()=>g(t),onDoubleClick:()=>void Ut(t),title:t===0?`The main sketch file (double-click to rename the sketch)`:`Double-click to rename`,children:e.name}),t>0&&(0,I.jsx)(`button`,{className:`ka-filetab-x`,"aria-label":`Remove ${e.name}`,onClick:()=>void Wt(t),children:(0,I.jsx)(c,{size:11})})]},e.name)),(0,I.jsx)(`button`,{className:`k-icon-btn ka-addtab`,"aria-label":`Add a file`,title:`Add a file (.h, .cpp…)`,onClick:()=>void Bt(),children:(0,I.jsx)(fe,{size:13})})]}),(0,I.jsx)(`div`,{className:`ka-editor`,children:(0,I.jsx)(be,{value:ht.content,language:`plain`,lineNumbers:!0,fontSize:13,onChange:e=>{e!==ht.content&&zt(h,e)},onReady:e=>{H.current=e,Ye(e)}})}),(0,I.jsx)(an,{open:Ne,onToggle:()=>Pe(e=>!e),example:y,report:_t,family:gt,boardName:Ae(b),onLibrary:e=>{k(!0),Me(`libraries`),Le(t=>({query:e,n:t.n+1}))}}),(0,I.jsx)(rt,{result:C,busy:w,onJump:Yt})]}),A&&(0,I.jsx)(Ht,{supported:It(),open:Ve,baud:ze,onBaud:e=>{mt.current=!0,Be(e)},resetDtr:ot,onResetDtr:st,onConnect:()=>void $t(),onDisconnect:()=>void B.current?.close(),note:Ue,view:We,onView:Ge,entries:bn,columns:yn,total:L?L.total:z.current.total,timestamps:Ke,onTimestamps:qe,autoscroll:Je,onAutoscroll:P,paused:L!==null,onPause:nn,ending:it,onEnding:at,onSend:e=>{(e.length||it!==`none`)&&Q(e)},onClear:tn,onCopy:()=>void rn(),onSave:()=>void on(),onSaveCsv:()=>void pn(),hidden:lt,onToggleSeries:e=>ut(t=>{let n=new Set(t);return n.has(e)?n.delete(e):n.add(e),n})})]}),(0,I.jsxs)(`div`,{className:`k-statusbar`,children:[(0,I.jsx)(`span`,{children:ee?ae(ee):`Not saved yet`}),(0,I.jsx)(`span`,{children:_?`Edited`:``}),(0,I.jsx)(`span`,{style:{marginLeft:`auto`},children:Ae(b)}),(0,I.jsx)(`span`,{title:S?.cli?`arduino-cli on the KherveOS server`:void 0,children:S===void 0?`Checking the toolchain…`:S===null?`Server not reachable or not signed in`:S.cli?`arduino-cli ${S.version??``}`:`arduino-cli is missing on the server`}),gn&&(0,I.jsxs)(`span`,{className:`ka-status-bad`,children:[Ie(C.diagnostics),` error`,Ie(C.diagnostics)>1?`s`:``]})]})]})}export{$ as SKETCH_DIR,pn as default};