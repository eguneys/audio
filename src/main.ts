import Iksir, { Play, Quad } from 'iksir'
import sprites_png from '../assets/sprites.png'

import Input from './input'
import { ticks } from './shared'

function load_image(path: string): Promise<HTMLImageElement> {
  return new Promise(resolve => {
    let res = new Image()
    res.onload = () => resolve(res)
    res.src = path
  })
}


type Context = {
	play: Play,
  input: Input,
	image: HTMLImageElement,
  config: Config
}

abstract class IMetro {
  get play(): Play { return this.ctx.play }
	get a(): HTMLImageElement { return this.ctx.image }
  get c(): Config { return this.ctx.config }

  t_life!: number
  t_life0!: number

  data: any

  palette: Anim = new Anim(this.a, 0, 0, 1, 1)

	constructor(readonly ctx: Context) {}

  init(): this {
    this.t_life = 0
    this.t_life0 = 0
    this._init()
    return this
  }

  update(dt: number, dt0: number) {
    this.t_life += dt
    this._update(dt, dt0)
    this.t_life0 = this.t_life
  }

  draw() {
    this._draw()
  }

  on_interval(v: number) {
    return Math.floor(this.t_life0 / v) !== Math.floor(this.t_life / v)
  }


  _set_data(data: any): this { 
    this.data = data 
    return this
  }

  abstract _init(): void;
  abstract _update(dt: number, dt0: number): void;
  abstract _draw(): void;
}

class Anim {

  quads: Array<Quad> = []

  frame: number = 0

  get quad(): Quad {
    if (!this.quads[this.frame]) {
      this.quads[this.frame] = Quad.make(this.image,
                                         this.x + this.w * this.frame,
                                         this.y, this.w, this.h)
    }
    return this.quads[this.frame]
  }

  constructor(readonly image: HTMLImageElement,
              readonly x: number, 
              readonly y: number,
              readonly w: number,
              readonly h: number) { }

  draw(play: Play, x: number, y: number, sx: number = 1, sy: number = sx) {
    x = Math.round(x)
    y = Math.round(y)
    play.draw(this.quad, x, y, 0, sx, sy)
  }


  rect(play: Play, frame: number, x: number, y: number, sx: number = 1, sy: number = sx) {
    this.frame = frame
    this.draw(play, x, y, sx, sy)
  }
}


class AllMetro extends IMetro {


  vplayer!: VAnalyser



  _init() {

    let context = new AudioContext()

    this.vplayer = new VAnalyser(this.ctx)
      ._set_data({ has_analyser: new MidiPlayer(context), color: 3 });

    let now = context.currentTime;

    let seq = 0
    composition_to_midi('180 C31 E3h G31').map(_ => {
      (this.vplayer.has_analyser as MidiPlayer)._set_data(_).a(now + seq)
      seq += _.dur
    })

  }

  _update(dt: number, dt0: number) {
    this.vplayer.update(dt, dt0)
  }

  _draw() {

    this.palette.rect(this.play, 1, 0, 0, 1920, 1080)
    this.vplayer.draw()
  } 
}

type Color = number
type VAnalyserData = {
  has_analyser: HasAudioAnalyser,
  color: Color
}
class VAnalyser extends IMetro {


  _data?: Float32Array

  get has_analyser(): HasAudioAnalyser {
    return this.data.has_analyser as HasAudioAnalyser
  }

  get analyser(): AnalyserNode | undefined {
    return this.has_analyser.analyser
  }
  
  get color(): Color {
    return this.data.color
  }

  _init() {}


  _update(dt: number, dt0: number) {

    if (this.analyser) {
      if (!this._data) {
        this._data = new Float32Array(this.analyser.frequencyBinCount)
      }
      this.analyser.getFloatTimeDomainData(this._data!)
    }
  }

  _draw() {
    if (this._data) {
      let w = 1920 / this._data.length
      for (let i = 0; i < this._data.length; i++) {
        let h = this._data[i] * 256 
        this.palette.rect(this.play, this.color, i * w, 540, w, -h)
      }
    }
  }

}

type Config = {
  pulse: PulseControls
}

export default function app(element: HTMLElement, config: Config) {

  let input: Input = new Input()
  let play = Iksir(element, 1920, 1080)

  load_image(sprites_png).then((image: HTMLImageElement) => {

    play.glOnce(image)

    let ctx: Context = {
      play,
      input,
      image,
      config
    }

    let metro = new AllMetro(ctx).init()

    let fixed_dt = 1000/60
    let timestamp0: number | undefined,
      min_dt = fixed_dt,
      max_dt = fixed_dt * 2,
      dt0 = fixed_dt

    let elapsed = 0
    function step(timestamp: number) {

      let dt = timestamp0 ? timestamp - timestamp0 : fixed_dt

      dt = Math.max(min_dt, dt)
      dt = Math.min(max_dt, dt)

      input.update(dt, dt0)

      if (input.btn('z') > 0) {
        metro.init()
      }
      if (input.btn('e') > 0) {
        if (elapsed++ % 24 === 0) {
          metro.update(dt, dt0)
        }
      } else {
        metro.update(dt, dt0)
      }

      metro.draw()
      play.flush()
      dt0 = dt 
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
}

abstract class HasAudioAnalyser {
  analyser?: AnalyserNode

  gain?: GainNode


  constructor(readonly context: AudioContext) {}

  a(time: number = this.context.currentTime) {
    let { context } = this

    this.gain = context.createGain()
    this.analyser = context.createAnalyser()

    this.gain.gain.setValueAtTime(0.1, time)
    this.gain!.connect(this.analyser)
    this.analyser.connect(context.destination)
    this._a(time)
  }

  abstract _a(time: number): void;
}

type MidiNote = {
  dur: number,
  freq: number
}

class MidiPlayer extends HasAudioAnalyser {

  data!: MidiNote

  _set_data(data: MidiNote) {
    this.data = data
    return this
  }

  _a(now: number) {


    let { context } = this
    let out_gain = this.gain!

    let { dur, freq } =  this.data

    let osc1 = new OscillatorNode(context, { type: 'sawtooth' })

    let filter = new BiquadFilterNode(context, { type: 'lowpass' })
    osc1.connect(filter)

    let envelope = new GainNode(context)
    filter.connect(envelope)
    envelope.connect(out_gain)


    let cutoff = 12000

    osc1.frequency.setValueAtTime(freq, now)

    adsr(filter.frequency, 
      now,
      dur,
      { a: 0.0, d: 0.3, s: 0 },
      cutoff,
      cutoff * 1.5,
      cutoff)

    adsr(envelope.gain,
      now,
      dur,
      { a: 0.02, d: 0.3, s: 0.48, r: 0.2 },
      0,
      1,
      1)


    osc1.start(now)
    osc1.stop(now + dur * 2)
  }

}

type Adsr = {
  a: number,
  d: number,
  s: number,
  r?: number
}

function adsr(param: AudioParam, now: number, dur: number, {a,d,s,r}: Adsr, start: number, max: number, min: number) {

  a *= dur
  d *= dur
  s *= dur

  if (r) {
    r *= dur
  }

  param.setValueAtTime(start, now)
  param.linearRampToValueAtTime(max, now + a)
  param.linearRampToValueAtTime(min, now + a + s + d)

  r && param.linearRampToValueAtTime(0, now + a + s + d + r)
}


type Composition = string

// '120 C3w C#2q'
function composition_to_midi(comp: Composition) {
  let [tempo, ...notes] = comp.split(' ')


  return notes.map(_note => {
    let value = _note.slice(-1)
    let note = _note.slice(0, -1)
    return {
      dur: note_value(parseInt(tempo), value),
      freq: note_freq(note)
    }
  })
}

type Tempo = number
type Beat = number

let note_values = ['2', '1', 'h', 'q', 'e', 'x']
let note__values = [2, 1, 1/2, 1/4, 1/8, 1/16]

type NoteValue = typeof note_values[number]

let notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

type Octave = 1 | 2 | 3 | 4 | 5 | 6
type Note = string

/* https://github.com/jergason/notes-to-frequencies/blob/master/index.js */
function note_freq(note: Note) {

  let octave = parseInt(note.slice(-1))
  let pitch = notes.indexOf(note.slice(0, -1))

  let n = pitch + octave * 12
  
  return 440 * Math.pow(2, (n - 57) / 12)
}


function note_value(tempo: Tempo, value: NoteValue) {
  let beat = 60 / tempo
  return note__values[note_values.indexOf(value)] * beat
}

class Snare extends HasAudioAnalyser {

  _noise!: AudioBuffer

  get noise(): AudioBuffer {
    if (!this._noise) {
      let bufferSize = this.context.sampleRate
      let buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate)
      let output = buffer.getChannelData(0)

      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1
      }
      this._noise = buffer
    }
    return this._noise
  }

  _a(time: number) {
    let { context } = this

    let noise = context.createBufferSource()
    noise.buffer = this.noise

    let filter = context.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.setValueAtTime(time, 1000)
    noise.connect(filter)

    let envelope = context.createGain()
    filter.connect(envelope)

    envelope.gain.setValueAtTime(1, time)
    envelope.gain.exponentialRampToValueAtTime(0.01, time + 0.2)

    envelope.connect(this.gain!)
    noise.start(time)
    noise.stop(time + 0.2)
  }
}


type PulseControls = {
  cutoff: number,
  volume: number,
  pulse_width: number,
  attack: number,
  release: number,
  sustain: number,
  decay: number,
  note: number,
  semi: number,
  filter_envelope: number,
  filter_envelope_attack: number,
  filter_envelope_release: number,

  echo: number,
  feedback: number,
  delay: number
}



/* https://github.com/pendragon-andyh/WebAudio-PulseOscillator */
class PulseOscillator extends HasAudioAnalyser {

  data!: PulseControls

  _set_data(data: PulseControls) {
    this.data = data
    return this
  }

  _a(now: number) {

    let { context } = this

    const constantCurve = (value: number) => {
      const curve = new Float32Array(2)
      curve[0] = value
      curve[1] = value
      return curve
    }

    let squareCurve = new Float32Array(256)
    squareCurve.fill(-1, 0, 128)
    squareCurve.fill(1, 128, 256)

    let frequency = 440 * Math.pow(2, 1/12 * this.data.note),
      frequency2 = 440 * Math.pow(2, 1/12 * (this.data.note + this.data.semi))

    let sawtooth = new OscillatorNode(context, { type: 'sawtooth', frequency })
    let squareShaper = new WaveShaperNode(context, { curve: squareCurve })
    let constantShaper = new WaveShaperNode(context, { curve: constantCurve(this.data.pulse_width) })

    sawtooth.connect(constantShaper)
    constantShaper.connect(squareShaper)
    sawtooth.connect(squareShaper)

    let sawtooth2 = new OscillatorNode(context, { type: 'sawtooth', frequency: frequency2 })
    let squareShaper2 = new WaveShaperNode(context, { curve: squareCurve })
    let constantShaper2 = new WaveShaperNode(context, { curve: constantCurve(this.data.pulse_width) })

    sawtooth2.connect(constantShaper2)
    constantShaper2.connect(squareShaper2)
    sawtooth2.connect(squareShaper2)



    let input = new GainNode(context)
    sawtooth.connect(input)
    sawtooth2.connect(input)

    /* https://github.com/Theodeus/tuna/blob/master/tuna.js */
    let activate = new GainNode(context),
      dry = new GainNode(context),
      wet = new GainNode(context),
      delay = new DelayNode(context, { maxDelayTime: 2 }),
      feedback = new GainNode(context),
      output = new GainNode(context)

    input.connect(activate)
    activate.connect(delay)
    activate.connect(dry)
    delay.connect(feedback)
    feedback.connect(delay)
    feedback.connect(wet)
    wet.connect(output)
    dry.connect(output)

    feedback.gain.setValueAtTime(this.data.feedback, now)
    wet.gain.setValueAtTime(this.data.echo, now)
    dry.gain.setValueAtTime(1-this.data.echo, now)
    delay.delayTime.setValueAtTime(this.data.delay, now)

    let lowpass = new BiquadFilterNode(context, { type: 'lowpass' })
    lowpass.frequency.setValueAtTime(this.data.cutoff, now)
    output.connect(lowpass)

    lowpass.frequency.linearRampToValueAtTime(this.data.cutoff + this.data.filter_envelope, 
                                              now + this.data.filter_envelope_attack)
    lowpass.frequency.linearRampToValueAtTime(this.data.cutoff,
                                              now + this.data.filter_envelope_attack + this.data.filter_envelope_release)

    let { attack, release, decay, sustain } = this.data
    let envelope = new GainNode(context)
    lowpass.connect(envelope)
    envelope.connect(this.gain!)

    envelope.gain.setValueAtTime(0.01, now)
    envelope.gain.linearRampToValueAtTime(1, now + attack)
    envelope.gain.linearRampToValueAtTime(0.5, now + attack + decay)
    envelope.gain.setValueAtTime(0.5, now + attack + decay + sustain)
    envelope.gain.linearRampToValueAtTime(0.000, now + attack + decay + sustain + release)

    this.gain!.gain.setValueAtTime(this.data.volume, now)
    sawtooth.start(now)
    sawtooth2.start(now)
    sawtooth.stop(now + now + attack + decay + sustain + release)
    sawtooth2.stop(now + now + attack + decay + sustain + release)
  }

}
