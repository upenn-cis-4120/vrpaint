import {vec3} from 'gl-matrix';
import {Component, InputComponent, MeshComponent, Property, Texture} from '@wonderlandengine/api';
import {CursorTarget, HowlerAudioSource} from '@wonderlandengine/components';
import {PaintManager} from './paintManager.js';
/**
 * Helper function to trigger haptic feedback pulse.
 *
 * @param {Object} object An object with 'input' component attached
 * @param {number} strength Strength from 0.0 - 1.0
 * @param {number} duration Duration in milliseconds
 */
export function hapticFeedback(object, strength, duration) {
    const input = object.getComponent(InputComponent);
    if (input && input.xrInputSource) {
        const gamepad = input.xrInputSource.gamepad;
        if (gamepad && gamepad.hapticActuators)
            gamepad.hapticActuators[0].pulse(strength, duration);
    }
}

/**
 * Button component.
 *
 * Shows a 'hoverMaterial' on cursor hover, moves backward on cursor down,
 * returns to its position on cursor up, plays click/unclick sounds and haptic
 * feedback on hover.
 *
 * Use `target.onClick.add(() => {})` on the `cursor-target` component used
 * with the button to define the button's action.
 *
 * Supports interaction with `finger-cursor` component for hand tracking.
 */
export class ButtonComponent extends Component {
    static TypeName = 'button';
    static Properties = {
        /** Object that has the button's mesh attached */
        buttonMeshObject: Property.object(),
        /** Material to apply when the user hovers the button */
        hoverMaterial: Property.material(),
        paintableWrapper: Property.object(),
        function_id: Property.int(1)
    };

    static onRegister(engine) {
        engine.registerComponent(HowlerAudioSource);
        engine.registerComponent(CursorTarget);
    }

    /* Position to return to when "unpressing" the button */
    returnPos = new Float32Array(3);

    start() {
        this.mesh = this.buttonMeshObject.getComponent(MeshComponent);
        this.defaultMaterial = this.mesh.material;
        this.buttonMeshObject.getTranslationLocal(this.returnPos);

        this.target =
            this.object.getComponent(CursorTarget) ||
            this.object.addComponent(CursorTarget);

        this.soundClick = this.object.addComponent(HowlerAudioSource, {
            src: 'sfx/click.wav',
            spatial: true,
        });
        this.soundUnClick = this.object.addComponent(HowlerAudioSource, {
            src: 'sfx/unclick.wav',
            spatial: true,
        });
        this.manager = this.paintableWrapper.getComponent(PaintManager);
    }

    onActivate() {
        this.target.onHover.add(this.onHover);
        this.target.onUnhover.add(this.onUnhover);
        this.target.onDown.add(this.onDown);
        this.target.onUp.add(this.onUp);
    }

    onDeactivate() {
        this.target.onHover.remove(this.onHover);
        this.target.onUnhover.remove(this.onUnhover);
        this.target.onDown.remove(this.onDown);
        this.target.onUp.remove(this.onUp);
    }

    /* Called by 'cursor-target' */
    onHover = (_, cursor) => {
        this.mesh.material = this.hoverMaterial;
        if (cursor.type === 'finger-cursor') {
            this.onDown(_, cursor);
        }

        hapticFeedback(cursor.object, 0.5, 50);
    }

    /* Called by 'cursor-target' */
    onDown = (_, cursor) => {
        this.soundClick.play();
        if (this.function_id != 14) {
            this.buttonMeshObject.translate([0.0, 0.0, -0.1]);
        }
        console.log(cursor.cursorPos);
        hapticFeedback(cursor.object, 1.0, 20);

        switch (this.function_id) {
            case 1:
                this.manager.setRadius(this.manager.getRadius() + 0.01);
                break;
            case 2:
                this.manager.setRadius(this.manager.getRadius() - 0.01);
                break;
            case 3:
                this.manager.setOpacity(this.manager.getOpacity() + 0.1);
                break;
            case 4:
                this.manager.setOpacity(this.manager.getOpacity() - 0.1);
                break;
            case 5:
                this.manager.setFalloff(this.clamp(this.manager.getFalloff() + 1, 0, 5));
                break;
            case 6:
                this.manager.setFalloff(this.clamp(this.manager.getFalloff() - 1, 0, 5));
                break;
            case 7: //more red
                this.manager.setColor([this.manager.getColor()[0] + 0.1, this.manager.getColor()[1], this.manager.getColor()[2]]);
                break;
            case 8: //less red
                this.manager.setColor([this.manager.getColor()[0] - 0.1, this.manager.getColor()[1], this.manager.getColor()[2]]);
                break;
            case 9: //more green
                this.manager.setColor([this.manager.getColor()[0], this.manager.getColor()[1] + 0.1, this.manager.getColor()[2]]);
                break;
            case 10: //less green
                this.manager.setColor([this.manager.getColor()[0], this.manager.getColor()[1] - 0.1, this.manager.getColor()[2]]);
                break;
            case 11: //more blue
                this.manager.setColor([this.manager.getColor()[0], this.manager.getColor()[1], this.manager.getColor()[2] + 0.1]);
                break;
            case 12: //less blue
                this.manager.setColor([this.manager.getColor()[0], this.manager.getColor()[1], this.manager.getColor()[2] - 0.1]);
                break;
            case 13:
                this.manager.switchSymmetry();
                break;
            case 14:
                let n = vec3.create();
                this.buttonMeshObject.getForward(n);
                vec3.normalize(n, n)
                let delta = vec3.create();
                vec3.subtract(delta, cursor.cursorPos, this.returnPos);
                let dot = vec3.dot(n, delta);
                vec3.scale(n, n, dot)
                let perp = vec3.create();
                vec3.subtract(perp, delta, n);
                vec3.normalize(n, n)

                let right = vec3.create();
                this.buttonMeshObject.getRight(right);
                vec3.normalize(right, right);
                let up = vec3.create();
                vec3.cross(up, n, right);
                vec3.normalize(up, up);

                let perpNorm = vec3.create()
                vec3.normalize(perpNorm, perp);
                
                let angle = Math.acos(vec3.dot(perpNorm, up));
                if (vec3.dot(perpNorm, right) < 0) {
                    angle *= -1;
                    angle += 6.28;
                }
                console.log("angle:");
                
                //angle *= 180 / 3.14
                angle /= 6.28;
                // 0.4 is radius of thing
                let color = this.HSVtoRGB(angle, vec3.length(perp) / 0.2, 1);
                console.log(color);
                this.manager.setColor(color);
                break;
            default:
        };

    }

    HSVtoRGB(h, s, v) {
        var r, g, b, i, f, p, q, t;
        if (arguments.length === 1) {
            s = h.s, v = h.v, h = h.h;
        }
        i = Math.floor(h * 6);
        f = h * 6 - i;
        p = v * (1 - s);
        q = v * (1 - f * s);
        t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: r = v, g = t, b = p; break;
            case 1: r = q, g = v, b = p; break;
            case 2: r = p, g = v, b = t; break;
            case 3: r = p, g = q, b = v; break;
            case 4: r = t, g = p, b = v; break;
            case 5: r = v, g = p, b = q; break;
        }
        return [r, g, b];
    }

    clamp(i, min, max) {
        return i < min ? min : (i > max ? max : i);
    }

    /* Called by 'cursor-target' */
    onUp = (_, cursor) => {
        this.soundUnClick.play();
        this.buttonMeshObject.setTranslationLocal(this.returnPos);
        hapticFeedback(cursor.object, 0.7, 20);
    }

    /* Called by 'cursor-target' */
    onUnhover = (_, cursor) => {
        this.mesh.material = this.defaultMaterial;
        if (cursor.type === 'finger-cursor') {
            this.onUp(_, cursor);
        }

        hapticFeedback(cursor.object, 0.3, 50);
    }
}
