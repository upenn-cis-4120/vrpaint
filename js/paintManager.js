import {Component, MeshAttribute, Property, MeshComponent, Texture, Physics} from '@wonderlandengine/api';

/**
 * paintManager
 */
export class PaintManager extends Component {
    static TypeName = 'paintManager';
    /* Properties that are configurable in the editor */
    static Properties = {
        param: Property.float(1.0),
        paintableMeshObject: Property.object(),
        playerObject: Property.object(),
    };

    static onRegister(engine) {
        /* Triggered when this component class is registered.
         * You can for instance register extra component types here
         * that your component may create. */
    }

    compileShader(gl, source, type) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
  
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error(gl.getShaderInfoLog(shader));
          gl.deleteShader(shader);
          return null;
        }
  
        return shader;
      }
  
      createProgram(gl, vertexShader, fragmentShader) {
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
  
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          console.error(gl.getProgramInfoLog(program));
          gl.deleteProgram(program);
          return null;
        }
  
        return program;
      }

    createTexture(gl, canvas) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        //const imageData = new Uint8Array(canvas.width * canvas.height * 4); 
        //gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        return texture;
    }

    

    init() {
        console.log('init() with param', this.param);

        this.canvas = document.createElement('canvas');
        this.canvas.width = 1024;
        this.canvas.height = 1024;

        this.outputCanvas = document.createElement('canvas');
        this.outputCanvas.width = this.canvas.width;
        this.outputCanvas.height = this.canvas.height;

        document.body.appendChild(this.outputCanvas);
        document.body.appendChild(this.canvas);
        //if (0){
        const gl = this.canvas.getContext('webgl2');
        if (!gl) {
            console.error('Unable to initialize WebGL. Your browser may not support it.')
        }
        
        this.mesh = this.paintableMeshObject.getComponent(MeshComponent);
        this.imageData = new Uint8Array(this.canvas.width * this.canvas.height * 4); 
        
      // MAIN SHADER PROGRAM
        //if (0) {
        const vsSource = `#version 300 es
        in mediump vec2 position;
        in mediump vec3 worldPos;

        out mediump vec3 frag_worldPos;
        out lowp vec2 frag_uvPos;
        void main() {
          frag_worldPos = worldPos;
          frag_uvPos = position;
          gl_Position = vec4(position, 0.0, 1.0);
        }
      `;

      // Fragment shader source code
      const fsSource = `#version 300 es
        uniform mediump vec3 paintPos;
        uniform mediump vec3 prevPaintPos;
        uniform lowp vec3 paintColor;
        uniform mediump float radius;
        uniform mediump float opacity;
        uniform mediump int falloff;

        in mediump vec3 frag_worldPos;
        in mediump vec2 frag_uvPos;
        
        out mediump vec4 fragColor;
        uniform sampler2D uTexture;
        uniform sampler2D uAlpha;

        void main() {
          mediump float i = 0.5f;
          mediump float factor = 0.0f;
          while (i < 1.f) {
            mediump float falloffFactor;
            mediump float distance = length(frag_worldPos - mix(paintPos, prevPaintPos, i));
            mediump float falloffDist = distance / radius;
            if (falloffDist < 1.f) {
              switch (falloff) {
                case 0: // Constant
                  falloffFactor = 1.f;
                  break;
                case 1: // Linear
                  falloffFactor = 1.f - falloffDist;
                  break;
                case 2: // Quadratic
                  falloffFactor = 1.f - falloffDist * falloffDist;
                  break;
                case 3: // Spheric
                  falloffFactor = sqrt(1.f - falloffDist * falloffDist);
                  break;
                case 4: // Smooth
                  falloffFactor = smoothstep(1.f, 0.f, falloffDist);
                  break;
                case 5: // Sharp
                  falloffFactor = 2.f* smoothstep(1.f, 0.f, 0.5 * falloffDist + 0.5 );
                  break;
                default:
                  falloffFactor = 1.f;
              }
              factor = max(factor, falloffFactor);
            }
            i += 1.f / 16.f;
          }
          factor = min(1.f, factor);
          fragColor = mix(vec4(paintColor, 1.0), texture(uTexture, 0.5 * (frag_uvPos + vec2(1.0))), (1.f - factor * opacity));
          //fragColor = distance <= radius ?
          //  mix(vec4(paintColor, 1.0), texture(uTexture, 0.5 * (frag_uvPos + vec2(1.0))), (1.f - falloffFactor))
          //  : texture(uTexture, 0.5 * (frag_uvPos + vec2(1.00)));
        }
      `;

      // Create shaders
      const vertexShader = this.compileShader(gl, vsSource, gl.VERTEX_SHADER);
      const fragmentShader = this.compileShader(gl, fsSource, gl.FRAGMENT_SHADER);

      // Create and link shader program
      this.shaderProgram = this.createProgram(gl, vertexShader, fragmentShader);

      
      const uvs = this.mesh.mesh.attribute(MeshAttribute.TextureCoordinate);
      const tempUV = uvs.createArray();
  
      const worldPositions = this.mesh.mesh.attribute(MeshAttribute.Position);
      const tempPos = worldPositions.createArray();

      const meshArr = new Float32Array(uvs.length * 5);
      for(let i = 0; i < uvs.length; i++) {
          const uv = uvs.get(i, tempUV);
          let pos = worldPositions.get(i, tempPos);
          
          // Transform local pos to world pos
          pos = [pos[0], pos[1], pos[2], 1];
          pos = this.paintableMeshObject.transformPointWorld(pos, pos);
          let out = [0.0, 0.0, 0.0];
          this.paintableMeshObject.getScalingWorld(out);
          const factor = out[0];
          pos[0] *= factor;
          pos[1] *= factor;
          pos[2] *= factor;
          // TODO: ROTATION?
          this.paintableMeshObject.getPositionWorld(out);
          pos[0] += out[0];
          pos[1] += out[1];
          pos[2] += out[2];
          
          meshArr[5*i] = uv[0] * 2.0 - 1.0;
          // Inverted this after putImageData was added, as it flipped the data vertically
          meshArr[5*i+1] = 1.0 - uv[1] * 2.0;
          meshArr[5*i+2] = pos[0];
          meshArr[5*i+3] = pos[1];
          meshArr[5*i+4] = pos[2];
      }


      // Get attribute location
      const positionAttrib = gl.getAttribLocation(this.shaderProgram, 'position');
      const worldPosAttrib = gl.getAttribLocation(this.shaderProgram, 'worldPos');      
      
      // Create buffer and store vertex data
      const vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, meshArr, gl.STATIC_DRAW);
      
      // VAO as we have multiple draw calls, and don't want to initialize this in during the draw call
      this.vaoMain = gl.createVertexArray();
      gl.bindVertexArray(this.vaoMain);

      // Point an attribute to the currently bound VBO
      gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 5*4, 0);
      gl.vertexAttribPointer(worldPosAttrib, 3, gl.FLOAT, false, 5*4, 2*4);

      gl.enableVertexAttribArray(positionAttrib);
      gl.enableVertexAttribArray(worldPosAttrib);

      gl.bindVertexArray(null);


      const indices = this.mesh.mesh.indexData; 
      this.indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);


      this.paintPosAttr = gl.getUniformLocation(this.shaderProgram, "paintPos");
      this.paintPrevPosAttr = gl.getUniformLocation(this.shaderProgram, "prevPaintPos");
      this.paintColAttr = gl.getUniformLocation(this.shaderProgram, "paintColor");
      this.textureAttr = gl.getUniformLocation(this.shaderProgram, "uTexture");
      this.radiusAttr = gl.getUniformLocation(this.shaderProgram, "radius");
      this.opacityAttr = gl.getUniformLocation(this.shaderProgram, "opacity");
      this.falloffAttr = gl.getUniformLocation(this.shaderProgram, "falloff");
      this.alphaAttr = gl.getUniformLocation(this.shaderProgram, "uAlpha");

//}

      //gl.uniform3f(this.paintPosAttr, 2.0, 3.0, 0.0);
      //gl.uniform3f(this.paintColAttr, 0.0, 1.0, 0.0);

      // Set up doubled frameBuffering
      const framebuffer1 = gl.createFramebuffer()
      const framebuffer2 = gl.createFramebuffer()
      this.currFramebuffer = framebuffer1
      this.nextFramebuffer = framebuffer2
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer1)
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const texture1 = this.createTexture(gl, this.canvas);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture1, 0)
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer2)
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const texture2 = this.createTexture(gl, this.canvas);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture2, 0)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      this.nextTexture = texture2
      this.currTexture = texture1

      // Set up PBO (unused)
      this.pbo = gl.createBuffer()
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo)
      const bufferSize = this.canvas.width * this.canvas.height * 4
      gl.bufferData(gl.PIXEL_PACK_BUFFER, bufferSize, gl.STREAM_READ);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

      //gl.uniform1i(this.textureAttr, 0);
      //gl.activeTexture(gl.TEXTURE0);
      //gl.bindTexture(gl.TEXTURE_2D, this.nextTexture);

      //gl.clearColor(1.0, 0.0, 0.0, 1.0);
      //gl.clear(gl.COLOR_BUFFER_BIT);
      // //gl.drawArrays(gl.TRIANGLES, 0, this.count * 3);
      //gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_INT, 0);
      // Right now this is just loading black into the original texture.
      //gl.readPixels(0, 0, this.canvas.width, this.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, this.imageData);
    

      

      const postPVert = `#version 300 es
      in vec2 pos;
      in vec2 uv;

      out lowp vec2 frag_uvPos;
      void main() {
        frag_uvPos = uv;
        gl_Position = vec4(pos, 0.0, 1.0);
      }
      `;

      const postPFrag = `#version 300 es
      precision mediump float; 
      
      in vec2 frag_uvPos;

      uniform sampler2D uTexture;
      uniform sampler2D uMask;

      out vec4 fragColor;

      void main() {
        float pixelSize = 1.0/1024.0;
        vec4 colorSum = vec4(0.0);
        float num = 0.0;
        if (texture(uMask, frag_uvPos) == vec4(0.0, 0.0, 0.0, 1.0)) {
          for (float i = -1.0; i <= 1.0; i++) {
            for (float j = -1.0; j <= 1.0; j++) {
              vec2 offset = vec2(i * pixelSize, j * pixelSize);
              if (texture(uMask, frag_uvPos + offset).b != 0.0) {
                colorSum += texture(uTexture, frag_uvPos + offset);
                num++; 
              }
            }
          }
          fragColor = num > 0.0 ? colorSum / num : vec4(0.0, 0.0, 0.0, 1.0);
        }
        else
        {
          fragColor = texture(uTexture, frag_uvPos); 
        }
        
      }
      `
      const postPVertShader = this.compileShader(gl, postPVert, gl.VERTEX_SHADER);
      const postPFragShader = this.compileShader(gl, postPFrag, gl.FRAGMENT_SHADER);
      this.postPShader = this.createProgram(gl, postPVertShader, postPFragShader);
      
      const squareUvs = new Float32Array([
        -1.0, -1.0,  0.0, 0.0,
        1.0, -1.0,  1.0, 0.0,
       -1.0,  1.0,  0.0, 1.0,
        1.0,  1.0,  1.0, 1.0,
      ]);
      const postPBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, postPBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, squareUvs, gl.STATIC_DRAW);

      const postPUVAttrib = gl.getAttribLocation(this.postPShader, 'uv');
      const postPPosAttrib = gl.getAttribLocation(this.postPShader, 'pos');
      this.postPTextureAttr = gl.getUniformLocation(this.postPShader, "uTexture");
      this.postPMaskAttr = gl.getUniformLocation(this.postPShader, "uMask");

      this.vaoSquare = gl.createVertexArray();
      gl.bindVertexArray(this.vaoSquare);

      gl.vertexAttribPointer(postPUVAttrib, 2, gl.FLOAT, false, 4*4, 2*4);
      gl.vertexAttribPointer(postPPosAttrib, 2, gl.FLOAT, false, 4*4, 0);

      gl.enableVertexAttribArray(postPUVAttrib);
      gl.enableVertexAttribArray(postPPosAttrib);

      gl.bindVertexArray(null);

      this.postPBuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.postPBuffer)
      this.postPTexture = this.createTexture(gl, this.canvas);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.postPTexture, 0)
      //gl.clearColor(0.0, 1.0, 0.0, 1.0);
      //gl.clear(gl.COLOR_BUFFER_BIT);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      //gl.vertexAttribPointer(postPUVAttrib, 2, gl.FLOAT, false, 0, 0);
      //gl.vertexAttribPointer(postPPosAttrib, 2, gl.FLOAT, false, 0, 0);

      //gl.useProgram(this.postPShader);
      // Try using it now i guess
      
      const uvMaskFrag = `#version 300 es
      out mediump vec4 fragColor;

      in mediump vec3 frag_worldPos;
      in mediump vec2 frag_uvPos;

      void main() {
        fragColor = vec4(0.0, 0.0, 1.0, 1.0);
      }`;

      const maskFragShader = this.compileShader(gl, uvMaskFrag, gl.FRAGMENT_SHADER);
      const maskShader = this.createProgram(gl, vertexShader, maskFragShader);

      this.maskBuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskBuffer);
      this.maskTexture = this.createTexture(gl, this.canvas);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.maskTexture, 0);

      gl.useProgram(maskShader);
      gl.bindVertexArray(this.vaoMain);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      gl.drawElements(gl.TRIANGLES, this.mesh.mesh.indexData.length, gl.UNSIGNED_INT, 0);
      
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      gl.bindVertexArray(null);


      // Frame count
        this.i = 0;
        //document.body.append(this.canvas);
        
        //Connect canvas to Wonderland
        this.texture = new Texture(this.mesh.engine, this.outputCanvas);
        this.mesh.material.diffuseTexture = this.texture;

        // Settings
        this.radius = 0.03;
        this.opacity = 0.15;
        this.falloff = 0;
        this.color = [1.0, 1.0, 1.0];
        this.useSymmetry = false;
        this.prevLoc = [-100.0, 0.0, 0.0]
    }

    getColor() {
        return this.color;
    }

    setColor(c) {
        this.color = [this.clamp(c[0], 0., 1.), this.clamp(c[1], 0., 1.), this.clamp(c[2], 0., 1.)];
    }

    getRadius() {
      return this.radius;
    }

    setRadius(r) {
      this.radius = r;
    }

    getOpacity() {
      return this.opacity;
    }

    setOpacity(o) {
      this.opacity = o;
    }

    getFalloff() {
      return this.falloff;
    }

    setFalloff(f) {
      this.falloff = f;
    }

    switchSymmetry() {
      this.useSymmetry = !this.useSymmetry;
    }

    start() {
        console.log('start() with param', this.param);
    }

    update(dt) {
        /* Called every frame. */
        this.i++;
        if (this.i % 4 >= 0) {//
          if (this.i % 40 == 0) {
            console.log(dt)
          }
            let t = [0.0, 0.0, 0.0];
            this.playerObject.getPositionWorld(t);
            let f = [0.0, 0.0, 0.0]
            this.playerObject.getForward(f);
            //let hit = WL.scene.rayCast(t, f, (1 << 1) | (1 << 2));
            let hit = WL.physics.rayCast(t,f, 255, 100);
            if (hit.hitCount > 0) {
              let location = [hit.locations[0][0], hit.locations[0][1], hit.locations[0][2]]
              //this.playerObject.transformPointWorld(location);
              //t[0]+=0.12;
              if (this.prevLoc[0] == -100.0) {
                this.prevLoc = location
              }
              //alert(location);
              this.paint(location, this.prevLoc, this.i);

              if (this.useSymmetry) {
                location[0] = -location[0];
                this.paint(location, this.prevLoc, this.i);
              }
              this.prevLoc = location
              
            } else {
              this.prevLoc = [-100.0, 0.0, 0.0]
            }
            
            
        }

        if (false) {
          let t = [0.0, 0.0, 0.0];
          this.playerObject.getPositionWorld(t);
          let loc = [t[0]-0.12, t[1], t[2]];
          this.paint(loc, this.i);
          
          if (this.useSymmetry) {
            loc[0] = -loc[0];
            this.paint(loc, this.i);
          }
        }
    }


    clamp(i, min, max) {
        return i < min ? min : (i > max ? max : i);
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
        return {
            r: r,
            g: g,
            b: b
        };
    }

    paint(brushPos, prevLoc, color) {
        const gl = this.canvas.getContext('webgl2');

        // SHADER PROGRAM DRAW CALL
        gl.useProgram(this.shaderProgram);
        // FLIP FBOs
        [this.currTexture, this.nextTexture] = [this.nextTexture, this.currTexture]
        var temp = this.currFramebuffer
        this.currFramebuffer = this.nextFramebuffer
        this.nextFramebuffer = temp
        
        // Bind VAO
        gl.bindVertexArray(this.vaoMain);
        // Bind indices array again
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        // Bind output
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.nextFramebuffer)
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.currTexture);
        gl.uniform1i(this.textureAttr, 0);


        gl.uniform3f(this.paintPosAttr, brushPos[0], brushPos[1], brushPos[2]);
        gl.uniform3f(this.paintPrevPosAttr, prevLoc[0], prevLoc[1], prevLoc[2]);

        gl.uniform1f(this.radiusAttr, this.radius);
        gl.uniform1f(this.opacityAttr, this.opacity);
        gl.uniform1i(this.falloffAttr, this.falloff);

        let colorA = this.HSVtoRGB((color % 360) / 360.0,  1.0, 1.0);
        color > 0 ? gl.uniform3f(this.paintColAttr, this.color[0], this.color[1], this.color[2]) : gl.uniform3f(this.paintColAttr, 0.0, 0.0, 0.0);
        //gl.clear(gl.COLOR_BUFFER_BIT);
        console.log("paint call called");
        
        gl.drawElements(gl.TRIANGLES, this.mesh.mesh.indexData.length, gl.UNSIGNED_INT, 0);
        
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        //gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        
        gl.useProgram(this.postPShader);
        gl.bindVertexArray(this.vaoSquare);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.postPBuffer);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.nextTexture);
        gl.uniform1i(this.postPTextureAttr, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
        gl.uniform1i(this.postPMaskAttr, 1);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        gl.bindVertexArray(null);
        //gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
        //gl.readPixels(0, 0, this.canvas.width, this.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, 0);

        gl.readPixels(0, 0, this.canvas.width, this.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, this.imageData);

        // 6. Insert a fence to synchronize operations
        //const fenceSync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        //gl.flush(); // Ensure all previous commands are issued

        // 7. Wait for the fence to be signaled
        //let status = gl.CLIENT_WAIT_SYNC_TIMEOUT_EXPIRED;
        //while (status !== gl.ALREADY_SIGNALED && status !== gl.CONDITION_SATISFIED) {
        //    status = gl.clientWaitSync(fenceSync, 0, 1); // Wait for up to 1ms
        //}

        //gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.imageData);
        //const pboSize = this.canvas.width * this.canvas.height * 4


        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)

        const ctx = this.outputCanvas.getContext('2d');

        // For some reason this process flips the image along the y-axis, so I have edited the vertex shader UVs
        const imageData = new ImageData(new Uint8ClampedArray(this.imageData), this.canvas.width, this.canvas.height);
        ctx.putImageData(imageData, 0, 0);
        
        //ctx.fillStyle = 'red';
        //ctx.beginPath();
        //ctx.arc(1024 * Math.random(), 1024 * Math.random(), 200, 0, 2*Math.PI);
        //ctx.fill();
        this.texture.update();

    }
}
