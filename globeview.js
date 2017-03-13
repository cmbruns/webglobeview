// GlobeView Earth viewing app
// Copyright (c) 2017 Christopher M. Bruns
// All rights reserved.

/*jslint es6, browser: true */
/*global window, alert, requestAnimationFrame */
"use strict";

// Copy existing or create new globeview namespace
const globeview = window.globeview || {};

// This IEFF populates the globeview namespace
(function (globeview) {
    "use strict";
    // Define GLSL shader programs as strings
    const vertexShader = `#version 300 es
        #line 18
        // Create a static triangle strip covering the entire viewport
        const vec4 SCREEN_QUAD[4] = vec4[4](
            vec4(-1, -1, 0.5, 1),
            vec4( 1, -1, 0.5, 1),
            vec4(-1,  1, 0.5, 1),
            vec4( 1,  1, 0.5, 1));
        // interpolate the corner positions
        const vec2 SCREEN_COORD[4] = vec2[4](
            vec2(-1, -1),
            vec2( 1, -1),
            vec2(-1,  1),
            vec2( 1,  1));

        uniform float zoom; // half-screens per radian

        out vec2 screen_xy; // units of radians at screen center
        // quadratic formula coefficents for perspective projection ray casting
        flat out float qa1, qb, qc, vh;

        void main() {
            gl_Position = SCREEN_QUAD[gl_VertexID];
            // scale the corner locations to apply the current zoom level, in half-screens per radian
            screen_xy = SCREEN_COORD[gl_VertexID] / zoom;

            // Precompute perspective coefficients
            // todo: expose viewHeight to the user
            const float viewHeight = 5.0; // radians
            qa1 = viewHeight * viewHeight; // one part of a coefficient
            qb = -2.0 * (qa1 + viewHeight);
            qc = qa1 + 2.0 * viewHeight;
            vh = viewHeight;
        }
    `;

    const fragmentShader = `#version 300 es
        #line 54
        precision highp float;

        // keep these projection indices in sync with javascript declarations, below...
        const int EQUIRECTANGULAR = 1;
        const int ORTHOGRAPHIC = 2;
        const int PERSPECTIVE = 3;

        uniform sampler2D world_texture;
        uniform int projection;
        uniform mat3 rotation;

        in vec2 screen_xy; // units of radians at screen center
        flat in float qa1, qb, qc, vh;

        out vec4 out_color;

        const float PI = 3.14159265359;

        // Convert points on the unit sphere to longituded and latitude angles, in radians
        vec2 longlatFromXyz(in vec3 xyz) {
            float r = length(xyz.xz);
            return vec2(atan(xyz.x, xyz.z),
                        atan(xyz.y, r));
        }

        // Convert from input equirectangular image, to unit sphere surface xyz
        vec2 texCoordFromXyz(in vec3 xyz) {
            vec2 longlat = longlatFromXyz(xyz);
            vec2 uv = vec2(
                0.5 + 0.5 * longlat.x / PI,
                0.5 + -longlat.y / PI);
            return uv;
        }

        // Deproject equirectangular
        vec3 sphereFromEquirectangular(in vec2 screenXy) {
            float lat = screenXy.y;
            if (abs(lat) > 0.5 * PI) discard;
            float y = sin(lat);
            float lon = screenXy.x;
            float s = cos(lat);
            float x = s * sin(lon);
            float z = s * cos(lon);
            return vec3(x, y, z);
        }

        // Deproject orthographic
        vec3 sphereFromOrthographic(in vec2 screenXy) {
            float y = screenXy.y;
            float x = screenXy.x;
            float z = 1.0 - x*x - y*y;
            if (z < 0.0) discard;
            z = sqrt(z);
            return vec3(x, y, z);
        }

        // Deproject perspective
        vec3 sphereFromPerspective(in vec2 screenXy) {
            // quadratic formula result of ray-casting equation, coefficents a, b, c:
            float qa = dot(screenXy, screenXy) + qa1;
            // quadratic formula determinant b^2 - 4ac:
            float determinant = qb*qb - 4.0*qa*qc;
            if (determinant < 0.0) discard;
            float t = (-qb - sqrt(determinant))/(2.0*qa);
            vec3 xyz = vec3(0, 0, vh + 1.0) + t * vec3(screenXy, -vh);
            return xyz;
        }

        void main() {
            // Choose the map projection
            vec3 xyz;
            if (projection == EQUIRECTANGULAR)
                xyz = sphereFromEquirectangular(screen_xy);
            else if (projection == ORTHOGRAPHIC)
                xyz = sphereFromOrthographic(screen_xy);
            else
                xyz = sphereFromPerspective(screen_xy);

            // Center on the current geographic location
            xyz = rotation * xyz;

            // Fetch the color from the world image
            vec2 uv = texCoordFromXyz(xyz);
            out_color =
                    texture(world_texture, uv);
        }
    `;

    // assign a unique index to each projection, for communicating between javascript and GLSL.
    // NOTE: remember to synchronize these with the GLSL versions (above)
    const EQUIRECTANGULAR = 1;
    const ORTHOGRAPHIC = 2;
    const PERSPECTIVE = 3;

    let gl = null; // OpenGL context
    let vao = null; // OpenGL vertex array object
    let program = null; // GLSL shader program handle
    let world_texture = null; // Satellite image
    // GLSL uniform parameters below
    let zoom_loc = -1;
    let zoom = 1.0; // half-screens per radian
    let projection_loc = -1;
    let projection = ORTHOGRAPHIC;
    let rotation_loc = -1;
    let rotation = [
        1.0, 0.0, 0.0,
        0.0, 1.0, 0.0,
        0.0, 0.0, 1.0
    ];
    let centerLongitude = 0.0;
    let centerLatitude = 0.0;

    // verify whether the canvas size matches the current browser window size
    function resize(canvas) {
        // Lookup the size the browser is displaying the canvas.
        const displayWidth = Math.floor(0.9 * canvas.clientWidth);
        const displayHeight = Math.floor(0.9 * canvas.clientHeight);

        // Check if the canvas is not the same size.
        if (canvas.width !== displayWidth ||
                canvas.height !== displayHeight) {

            // Make the canvas the same size
            canvas.width = displayWidth;
            canvas.height = displayHeight;
        }
    }

    // first time setup of opengl state
    function initGL(canvas) {
        gl = canvas.getContext("webgl2");
        if (!gl) {
            alert("Could not initialise WebGL, sorry :-(");
            return;
        }
        gl.clearColor(0.2, 0.2, 0.2, 1.0);
        gl.disable(gl.DEPTH_TEST);
        vao = gl.createVertexArray(); // webgl2 only
        gl.bindVertexArray(vao);
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vertexShader);
        gl.compileShader(vs);
        // Check if it compiled
        let success = gl.getShaderParameter(vs, gl.COMPILE_STATUS);
        if (!success) {
            // Something went wrong during compilation; get the error
            throw "could not compile shader:" + gl.getShaderInfoLog(vs);
        }
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fragmentShader);
        gl.compileShader(fs);
        // Check if it compiled
        success = gl.getShaderParameter(fs, gl.COMPILE_STATUS);
        if (!success) {
            // Something went wrong during compilation; get the error
            throw "could not compile shader:" + gl.getShaderInfoLog(fs);
        }
        program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        success = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (!success) {
            // something went wrong with the link
            throw ("program filed to link:" + gl.getProgramInfoLog(program));
        }
        const world_texture_loc = gl.getUniformLocation(program, "world_texture");

        zoom_loc = gl.getUniformLocation(program, "zoom");
        projection_loc = gl.getUniformLocation(program, "projection");
        rotation_loc = gl.getUniformLocation(program, "rotation");

        gl.useProgram(program);
        gl.uniform1i(world_texture_loc, 0);
        gl.uniform1f(zoom_loc, zoom);
        world_texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, world_texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
        // Use anisotropic mipmap filtering to avoid poor sampling at the poles.
        const aniso_ext = (
            gl.getExtension("EXT_texture_filter_anisotropic") ||
            gl.getExtension("MOZ_EXT_texture_filter_anisotropic") ||
            gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic")
        );
        if (aniso_ext) {
            const max = gl.getParameter(aniso_ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
            gl.texParameterf(gl.TEXTURE_2D, aniso_ext.TEXTURE_MAX_ANISOTROPY_EXT, max);
        }
    }

    // draw the earth
    function drawScene() {
        resize(gl.canvas);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindVertexArray(vao);
        gl.useProgram(program);

        gl.uniform1f(zoom_loc, zoom);
        gl.uniform1i(projection_loc, projection);
        gl.uniformMatrix3fv(rotation_loc, false, rotation);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, world_texture);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        requestAnimationFrame(drawScene);
    }

    // use mouse scroll wheel to zoom in and out
    function scrollZoom(event) {
        event.preventDefault();
        const e = window.event || event; // firefox
        const delta = Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail)));
        const factor = 1.10;
        if (delta > 0) {
            zoom *= factor;
        } else {
            zoom *= 1.0 / factor;
        }
        return false;
    }

    // begin drawing the earth for the first time
    globeview.start = function () {
        const canvas = document.getElementById("globeview_canvas");
        initGL(canvas);
        // Load the satellite picture of the earth
        const image = new Image();
        image.src = "world.topo.bathy.200411.3x5400x2700.jpg";
        image.onload = function () {
            gl.texImage2D(gl.TEXTURE_2D,
                    0, // mipLevel
                    gl.RGB, // internalFormat,
                    gl.RGB, // source format,
                    gl.UNSIGNED_BYTE,
                    image);
            gl.generateMipmap(gl.TEXTURE_2D);
            requestAnimationFrame(drawScene);
        };

        canvas.addEventListener("mousewheel", scrollZoom, false);
        canvas.addEventListener("DOMMouseScroll", scrollZoom, false);

        // drag mouse to shift center location
        let dragX = 0;
        let dragY = 0;
        function mouseDrag(event) {
            const dx = event.screenX - dragX;
            const dy = event.screenY - dragY;
            if ((dx === 0) && (dy === 0)) {
                return; // no change
            }
            dragX = event.screenX;
            dragY = event.screenY;
            if (Math.abs(dx) > 30) {
                return; // too much
            }
            if (Math.abs(dy) > 30) {
                return; // too much
            }
            const dlong = -2.0 * dx / canvas.width / zoom;
            centerLongitude += dlong;
            const dLat = 2.0 * dy / canvas.width / zoom;
            centerLatitude += dLat;
            centerLatitude = Math.min(centerLatitude, +0.5 * Math.PI);
            centerLatitude = Math.max(centerLatitude, -0.5 * Math.PI);
            const cy = Math.cos(-centerLongitude);
            const sy = Math.sin(-centerLongitude);
            const cx = Math.cos(centerLatitude);
            const sx = Math.sin(centerLatitude);
            // minimize arithmetic by manually combining "north-up" style rotation matrix
            rotation = [
                cy, 0.0, sy,
                sx * sy, cx, -sx * cy,
                -cx * sy, sx, cx * cy
            ];
            // console.log("center longitude = %d", centerLongitude * 180.0 / Math.PI);
            event.preventDefault(); // prevents browser scrolling
            // console.log("mouseDrag");
        }
        canvas.addEventListener("drag", mouseDrag, false);
    };

    // change the current map projection
    globeview.projectionChanged = function (proj) {
        if (proj === "equirectangular") {
            projection = EQUIRECTANGULAR;
        } else if (proj === "orthographic") {
            projection = ORTHOGRAPHIC;
        } else {
            projection = PERSPECTIVE;
        }
    };
}(globeview));
