import {Pane} from 'tweakpane'

export type NavigationMode = 'arcball' | 'walk' | 'ride';

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
        mode: NavigationMode;
        rideSpeed: number;      // world units per second (negative = backwards)
        walkSpeed: number;      // world units per second (negative = backwards)
    };
    private fpsBinding;
    private prevMilli: number;
    private fpsBindingText;
    private vertexBinding;
    // trackball UI
    public readonly trackballHost: HTMLDivElement;

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
            mode: 'arcball',
            rideSpeed: 4,
            walkSpeed: 1,
        }

        //#region 1. Torus knot parameters (changes rebuild the mesh)
        const paramsFolder = this.pane.addFolder({title: 'Torus Knot Parameters'})
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
        paramsFolder.on('change', () => {
            this.paramsChanged = true
            this.params.vertices = this.params.segments * this.params.tubeSegments
            this.vertexBinding.refresh()
        })
        //#endregion

        //#region 2. Navigation (separate folder: switching modes does not rebuild the mesh)
        const navigationFolder = this.pane.addFolder({title: 'Navigation'});
        const modeBinding = navigationFolder.addBinding(this.params, 'mode', {
            label: 'Mode',
            options: {
                'Arcball / turntable': 'arcball',
                'Walk on surface': 'walk',
                'Ride inside tube': 'ride',
            },
        });

        // ride speed: a plain slider in this folder, only shown while the ride mode is selected
        const rideSpeedBinding = navigationFolder.addBinding(this.params, 'rideSpeed', {
            label: 'Ride Speed',
            min: -10,
            max: 20,
            step: 0.5,
        });

        // walk speed: only shown while the walk mode is selected
        const walkSpeedBinding = navigationFolder.addBinding(this.params, 'walkSpeed', {
            label: 'Walk Speed',
            min: -5,
            max: 5,
            step: 0.1,
        });

        // show only the slider that belongs to the selected mode
        const updateModeSliderVisibility = () => {
            rideSpeedBinding.hidden = this.params.mode !== 'ride';
            walkSpeedBinding.hidden = this.params.mode !== 'walk';
        };
        modeBinding.on('change', updateModeSliderVisibility);
        updateModeSliderVisibility();   // correct state at startup

        // The trackball rings are a navigation control, so they live inside this folder
        // (and fold away with it). '.tp-fldv_c' is Tweakpane's folder content element.
        this.trackballHost = document.createElement('div');
        Object.assign(this.trackballHost.style, {
            display: 'flex',
            justifyContent: 'center',
            padding: '8px 0',
            background: 'transparent',
        });
        const navigationContent =
            navigationFolder.element.querySelector('.tp-fldv_c') ?? navigationFolder.element;
        navigationContent.appendChild(this.trackballHost);
        //#endregion

        //#region 3. Rendering information (read-only)
        const renderingFolder = this.pane.addFolder({title: 'Rendering'});
        this.fpsBinding = renderingFolder.addBinding(this.params, 'fps', {
            label: 'FPS',
            view: 'graph',
            readonly: true,
            min: 0,
            max: 144,
        })
        this.fpsBindingText = renderingFolder.addBinding(this.params, 'fps', {
            label: 'FPS',
            readonly: true,
            min: 0,
            max: 144,
            format: v => v.toString(),
        })
        this.vertexBinding = renderingFolder.addBinding(this.params, 'vertices', {
            label: 'Vertices',
            readonly: true,
            format: v => v.toString(),
        })
        //#endregion
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
