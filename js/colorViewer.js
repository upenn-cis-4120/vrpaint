import {Component, Property} from '@wonderlandengine/api';
import {PaintManager} from './paintManager.js';

/**
 * colorViewer
 */
export class ColorViewer extends Component {
    static TypeName = 'colorViewer';
    /* Properties that are configurable in the editor */
    static Properties = {
        paintableWrapper: Property.object(),
    };

    start() {
        const mesh = this.object.getComponent('mesh');
        if(!mesh) throw new Error('Missing mesh component on the object.');
        /* Ensure we don't accidentally change other objects using the same
         * material */
        this.material = mesh.material.clone();
        mesh.material = this.material;

        this.manager = this.paintableWrapper.getComponent(PaintManager);
    }

    update(dt) {
        const c = this.manager.getColor();
        this.material.diffuseColor = [c[0], c[1], c[2], 1.0];
    }
}
