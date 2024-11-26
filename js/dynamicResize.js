import {Component, Property} from '@wonderlandengine/api';

/**
 * dynamicResize
 */
export class DynamicResize extends Component {
    static TypeName = 'dynamicResize';
    /* Properties that are configurable in the editor */
    static Properties = {
        param: Property.float(1.0),
        controllerLeft: Property.object(),
        controllerRight: Property.object(),
        toTransform: Property.object(),
    };

    start() {
        console.log('start() with param', this.param);
        this.engine.onXRSessionStart.add(this.onXRSessionStart.bind(this));
        this.i = 0;
        this.squished = false;
        this.a = [0.0, 0.0, 0.0];
    }

    onXRSessionStart() {
        this.engine.xr.session.addEventListener("selectstart", (e) => console.log(e));
    }

    update(dt) {
        if (this.engine.xr && this.i % 100 == 0) {
            console.log(this.engine.xr.session.inputSources[0]);
        }
        let squishedFrame = false;
        if (this.engine.xr &&
            this.engine.xr.session.inputSources[0].gamepad.buttons[1].pressed
         && this.engine.xr.session.inputSources[1].gamepad.buttons[1].pressed) {
            squishedFrame = true;
        }

        if (squishedFrame && !this.squished) {
            console.log("held");
            var s = [0.0, 0.0, 0.0]
            this.controllerLeft.getPositionWorld(s);
            var t = [0.0, 0.0, 0.0]
            this.controllerRight.getPositionWorld(t);
            this.a = [t[0] - s[0], t[1] - s[1], t[2] - s[2]];
            console.log(this.a);
        }
        if (!squishedFrame && this.squished) {
            console.log("released");
            var s = [0.0, 0.0, 0.0]
            this.controllerLeft.getPositionWorld(s);
            var t = [0.0, 0.0, 0.0]
            this.controllerRight.getPositionWorld(t);
            let b = [t[0] - s[0], t[1] - s[1], t[2] - s[2]];
            let factor = this.length(b) / this.length(this.a);

            this.toTransform.scaleLocal([factor, factor, factor]);


            let axb = this.cross(this.normalize(this.a), this.normalize(b));
            let angle = Math.acos((this.a[0]*b[0] + this.a[1]*b[1] + this.a[2]*b[2]) / (this.length(this.a) * this.length(b)))
            // rotate axis to world space
            this.toTransform.rotateAxisAngleRadObject(axb, angle);


        }


        this.squished = squishedFrame;
        this.i++;
    }

    cross(a, b) {
        return [a[1] * b[2] - a[2] * b[1],
                a[2] * b[0] - a[0] * b[2],
                a[0] * b[1] - a[1] * b[0]];
    }
    
    normalize(a) {
        let len = this.length(a);
        if (len == 0) {
            return [1, 0, 0];
        }
        return [a[0] / len, a[1] / len, a[2] / len];
    }

    length(a) {
        return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
    }
}
