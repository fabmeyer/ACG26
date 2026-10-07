import {Pane} from 'tweakpane'

export class TorusKnotUI {
    private paramsChanged: boolean;
    private maxSegments: number;
    private maxTubeSegments: number;
    private readonly pane: Pane;
    public readonly params: {
        p: number;
        q: number;
        segments: number;
        tubeSegments: number;
        outerRadius: number;
        innerRadius: number;
        tubeRadius: number,
        fps: number;
        vertices: number;
        speed: number;
    };
    private fpsBinding;
    private prevMilli: number;
    private fpsBindingText;
    private vertexBinding;

    constructor(maxSegments: number, maxTubeSegments: number) {
        this.maxSegments = maxSegments;
        this.maxTubeSegments = maxTubeSegments;
        this.pane = new Pane()
        this.paramsChanged = false
        this.prevMilli = 0;
        this.params = {
            p: 2,
            q: 9,
            segments: 1000,
            tubeSegments: 30,
            outerRadius: 10.0,
            innerRadius: 2.0,
            tubeRadius: 0.5,
            fps: 0,
            vertices: 1000*30,
            speed: 0.01,
        }

        let paramsFolder = this.pane.addFolder({title: 'Torus Knot Parameters'})
        paramsFolder.addBinding(this.params, 'p', {
            label: 'P',
            step: 1,
            min: 0,
            max: 100,
        })
        paramsFolder.addBinding(this.params, 'q', {
            label: 'Q',
            step: 1,
            min: 0,
            max: 100,
        })
        paramsFolder.addBinding(this.params, 'segments', {
            label: 'Segments',
            step: 1,
            min: 4,
            max: this.maxSegments,
        })
        paramsFolder.addBinding(this.params, 'tubeSegments', {
            label: 'Tube Segments',
            step: 1,
            min: 4,
            max: this.maxTubeSegments,
        })
        paramsFolder.addBinding(this.params, 'outerRadius', {
            label: 'Outer Radius',
            min: 1.0,
            max: 15.0,
        })
        paramsFolder.addBinding(this.params, 'innerRadius', {
            label: 'Inner Radius',
            min: 0.5,
            max: 15.0,
        })
        paramsFolder.addBinding(this.params, 'tubeRadius', {
            label: 'Tube Radius',
            min: 0.01,
            max: 5.0,
        })
        paramsFolder.addBinding(this.params, 'speed', {
            label: 'Animation Speed',
            options: {
                None: 0.0,
                Lowest: 0.001,
                Lower: 0.005,
                Normal: 0.01,
                Higher: 0.05,
                Highest: 0.1,
            },
        })
        this.fpsBinding = this.pane.addBinding(this.params, 'fps', {
            label: 'FPS',
            view: 'graph',
            readonly: true,
            min: 0,
            max: 144,
        })
        this.fpsBindingText = this.pane.addBinding(this.params, 'fps', {
            label: 'FPS',
            readonly: true,
            min: 0,
            max: 144,
            format: v => v.toString(),
        })
        this.vertexBinding = this.pane.addBinding(this.params, 'vertices', {
            label: 'Vertices',
            readonly: true,
            format: v => v.toString(),
        })
        paramsFolder.on('change', () => {
            this.paramsChanged = true
            this.params.vertices = this.params.segments * this.params.tubeSegments
            this.vertexBinding.refresh()
        });
    }

    haveParamsChanged() {
        let res = this.paramsChanged;
        this.paramsChanged = false;
        return res;
    }

    fpsTick() {
        let currentMilli = Date.now();
        if (this.prevMilli === 0) {
            this.prevMilli = currentMilli;
            return;
        }

        this.params.fps = Math.round(1000 / (currentMilli - this.prevMilli));
        this.fpsBinding.refresh();
        this.fpsBindingText.refresh();
        this.prevMilli = currentMilli;
    }
}