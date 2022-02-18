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
	image: HTMLImageElement
}

abstract class IMetro {
  get play(): Play { return this.ctx.play }
	get a(): HTMLImageElement { return this.ctx.image }

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

  v_snare!: VAnalyser
  v_kick!: VAnalyser

  _init() {

    let context = new AudioContext()

    this.kick = new Kick(context)
    this.snare = new Snare(context)

    this.v_snare = new VAnalyser(this.ctx)._set_data({ has_analyser: this.snare, color: 3 })
    this.v_kick = new VAnalyser(this.ctx)._set_data({ has_analyser: this.kick, color: 6 })

  }

  _update(dt: number, dt0: number) {
  
    if (this.on_interval(ticks.seconds)) {
      this.snare.a(this.snare.context.currentTime)
    }

    if (this.on_interval(ticks.half)) {
      this.kick.a(this.kick.context.currentTime)
    }

    this.v_snare.update(dt, dt0)
    this.v_kick.update(dt, dt0)

  }

  _draw() {

    this.palette.rect(this.play, 1, 0, 0, 320, 180)
    this.v_kick.draw()
    this.v_snare.draw()
  }
}

type Color = number
type VAnalyserData = {
  has_analyser: HasAudioAnalyser,
  color: Color
}
class VAnalyser extends IMetro {

  _data?: Uint8Array

  get analyser(): AnalyserNode | undefined {
    return this.data.has_analyser.analyser
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
      let w = 320 / this._data.length * 4
      for (let i = 0; i < this._data.length; i++) {
        let h = this._data[i] / 256 * 120
        this.palette.rect(this.play, this.color, w * i, 180, w,  -h)
      }
    }
  }

}

export default function app(element: HTMLElement) {

  let input: Input = new Input()
  let play = Iksir(element)

  load_image(sprites_png).then((image: HTMLImageElement) => {

    play.glOnce(image)

    let ctx: Context = {
      play,
      input,
      image
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

  constructor(readonly context: AudioContext) {}


  abstract a(time: number): void;
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

  a(time: number) {
    let { context } = this

    let noise = this.context.createBufferSource()
    noise.buffer = this.noise

    let filter = this.context.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.setValueAtTime(time, 1000)
    noise.connect(filter)

    let envelope = this.context.createGain()
    filter.connect(envelope)

    //envelope.connect(this.context.destination)

    this.analyser = this.context.createAnalyser()
    envelope.connect(this.analyser)
    this.analyser.connect(this.context.destination)


    envelope.gain.setValueAtTime(1, time)
    envelope.gain.exponentialRampToValueAtTime(0.01, time + 0.2)
    noise.start(time)

    noise.stop(time + 0.2)
  }
}

class Kick extends HasAudioAnalyser {

  a(time: number) {
    let { context } = this

    let oscillator = context.createOscillator()
    let gain = context.createGain()

    oscillator.connect(gain)
    this.analyser = this.context.createAnalyser()
    gain.connect(this.analyser)
    this.analyser.connect(this.context.destination)


    oscillator.frequency.setValueAtTime(150, time)
    gain.gain.setValueAtTime(1, time)

    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5)
    oscillator.start(time)
    oscillator.stop(time + 0.5)
  }

}

