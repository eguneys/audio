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

  kick!: Kick
  snare!: Snare
  sawtooth!: Sawtooth

  v_snare!: VAnalyser
  v_kick!: VAnalyser
  v_sawtooth!: VAnalyser
  v_pulse!: VAnalyser

  _init() {

    let context = new AudioContext()

    this.kick = new Kick(context)
    this.snare = new Snare(context)

    this.v_snare = new VAnalyser(this.ctx)._set_data({ has_analyser: this.snare, color: 3 })
    this.v_kick = new VAnalyser(this.ctx)._set_data({ has_analyser: this.kick, color: 6 })

    this.sawtooth = new Sawtooth(context)
    this.v_sawtooth = new VAnalyser(this.ctx)._set_data({ has_analyser: this.sawtooth, color: 8 })


    this.v_pulse = new VAnalyser(this.ctx)
    ._set_data({ has_analyser: new PulseOscillator(context)._set_data(this.c.pulse), color: 9 })

  }

  _update(dt: number, dt0: number) {
  
    if (this.on_interval(ticks.seconds)) {
      //this.snare.a()
    }

    if (this.on_interval(ticks.half)) {
      this.kick.a()
    }

    if (this.on_interval(ticks.seconds * 2)) {
      //this.sawtooth.a()
      this.v_pulse.has_analyser.a()
    }
 

    this.v_snare.update(dt, dt0)
    this.v_kick.update(dt, dt0)
    this.v_sawtooth.update(dt, dt0)

    this.v_pulse.update(dt, dt0)
  }

  _draw() {

    this.palette.rect(this.play, 1, 0, 0, 1920, 1080)
    this.v_kick.draw()
    this.v_snare.draw()
    this.v_sawtooth.draw()
    this.v_pulse.draw()
  }
}

type Color = number
type VAnalyserData = {
  has_analyser: HasAudioAnalyser,
  color: Color
}
class VAnalyser extends IMetro {


  _data?: Uint8Array

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
        this._data = new Uint8Array(this.analyser.frequencyBinCount)
      }
      this.analyser.getByteTimeDomainData(this._data!)
    }
  }

  _draw() {
    if (this._data) {
      let w = 1920 / this._data.length
      for (let i = 0; i < this._data.length; i++) {
        let h = this._data[i] / 256 * 256 
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

class Kick extends HasAudioAnalyser {

  _a(time: number) {
    let { context, gain } = this

    let oscillator = context.createOscillator()
    oscillator.connect(gain!)

    oscillator.frequency.setValueAtTime(150, time)

    gain!.gain.exponentialRampToValueAtTime(0.001, time + 0.5)
    oscillator.start(time)
    oscillator.stop(time + 0.5)
  }

}

class Sawtooth extends HasAudioAnalyser {

  _a(now: number) {
    let { context } = this
    let os = [1,2,3,4,5,6,7,8,9,10,11,12].map(_ => context.createOscillator())

    os.forEach((_, i) => _.frequency.setValueAtTime(440 * (i + 1), now))

    os.forEach(_ => _.connect(this.gain!))

    let attack = 0.5,
      hold = 1,
      decay = 0.5,
      release = 1

    this.gain!.gain.setValueAtTime(0, now)
    this.gain!.gain.linearRampToValueAtTime(1, now + attack)

    this.gain!.gain.linearRampToValueAtTime(0.5, now + attack + hold)
    this.gain!.gain.linearRampToValueAtTime(0.2, now + attack + hold + decay)

    os.forEach(_ => _.start(now))

    this.gain!.gain.linearRampToValueAtTime(0.01, now + attack + hold + decay + release)

    os.forEach(_ => _.stop(now + attack + hold + decay + release))
  }
}

type PulseControls = {
  cutoff: number,
  volume: number,
  pulse_width: number
}
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

    let sawtooth = new OscillatorNode(context, { type: 'sawtooth', frequency: 440 })
    let squareShaper = new WaveShaperNode(context, { curve: squareCurve })
    let constantShaper = new WaveShaperNode(context, { curve: constantCurve(this.data.pulse_width) })

    sawtooth.connect(constantShaper)
    constantShaper.connect(squareShaper)
    sawtooth.connect(squareShaper)
    //squareShaper.connect(this.gain!)


    let lowpass = new BiquadFilterNode(context, { type: 'lowpass' })
    lowpass.frequency.setValueAtTime(this.data.cutoff, now)

    squareShaper.connect(lowpass)
    lowpass.connect(this.gain!)


    this.gain!.gain.setValueAtTime(this.data.volume, now)
    sawtooth.start(now)
    this.gain!.gain.exponentialRampToValueAtTime(0.001, now + 2)
    sawtooth.stop(now + 2)
  }

}
