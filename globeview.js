"use strict";

// Define GLSL shader programs as strings
const vertexShader = `#version 300 es
#line 6
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

out vec2 screen_xy;

void main() {
  gl_Position = SCREEN_QUAD[gl_VertexID];
  // scale the corner locations to apply the current zoom level, in half-screens per radian
  screen_xy = SCREEN_COORD[gl_VertexID] / zoom;
}
`;

const fragmentShader = `#version 300 es
#line 32
precision highp float;

// keep these projection indices in sync with javascript declarations, below...
const int EQUIRECTANGULAR = 1;
const int ORTHOGRAPHIC = 2;

uniform sampler2D world_texture;
uniform int projection;
uniform mat3 rotation;

in vec2 screen_xy;

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

void main() {
  // Choose the map projection
  vec3 xyz;
  if (projection == EQUIRECTANGULAR)
    xyz = sphereFromEquirectangular(screen_xy);
  else
    xyz = sphereFromOrthographic(screen_xy);

  // Center on the current geographic location
  xyz = rotation * xyz;

  // Fetch the color from the world image
  vec2 uv = texCoordFromXyz(xyz);
  out_color = 
      texture(world_texture, uv);
}
`;

// assign a unique index to each projection, for communicating between javascript and GLSL
const EQUIRECTANGULAR = 1;
const ORTHOGRAPHIC = 2;

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
let rotation = [1.0, 0.0, 0.0,
                0.0, 1.0, 0.0,
                0.0, 0.0, 1.0];

// verify whether the canvas size matches the current browser window size
function resize(canvas) {
  // Lookup the size the browser is displaying the canvas.
  const displayWidth  = ~~(0.9 * canvas.clientWidth);
  const displayHeight = ~~(0.9 * canvas.clientHeight);

  // Check if the canvas is not the same size.
  if (canvas.width  != displayWidth ||
      canvas.height != displayHeight) {

    // Make the canvas the same size
    canvas.width  = displayWidth;
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
      throw ("program filed to link:" + gl.getProgramInfoLog (program));
  }
  const world_texture_loc = gl.getUniformLocation(program, 'world_texture');

  zoom_loc = gl.getUniformLocation(program, 'zoom');
  projection_loc = gl.getUniformLocation(program, 'projection');
  rotation_loc = gl.getUniformLocation(program, 'rotation');

  gl.useProgram(program);
  gl.uniform1i(world_texture_loc, 0);
  gl.uniform1f(zoom_loc, zoom);
  world_texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, world_texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
}

// draw the earth
function drawScene() {
  resize(gl.canvas);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindVertexArray(vao);
  gl.useProgram(program);

  gl.uniform1f(zoom_loc, zoom);
  gl.uniform1i(projection_loc, projection)
  gl.uniformMatrix3fv(rotation_loc, false, rotation);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, world_texture);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  requestAnimationFrame(drawScene);
}

// change the current map projection
function projectionChanged(selectObject) {
  if (selectObject.value == 'equirectangular') {
    projection = EQUIRECTANGULAR;
  }
  else {
    projection = ORTHOGRAPHIC;
  }
}

// begin drawing the earth for the first time
function globeviewStart() {
  const canvas = document.getElementById("globeview_canvas");
  initGL(canvas);
  // Load the satellite picture of the earth
  const image = new Image();
  image.src = 'world.topo.bathy.200411.3x5400x2700.jpg';
  image.onload = function() {
    gl.texImage2D(gl.TEXTURE_2D,
      0, // mipLevel
      gl.RGB, // internalFormat,
      gl.RGB, // source format,
      gl.UNSIGNED_BYTE,
      image);
    gl.generateMipmap(gl.TEXTURE_2D);
    requestAnimationFrame(drawScene);
  }

  // use mouse scroll wheel to zoom in and out
  function scrollZoom(event) {
    event.preventDefault();
    const e = window.event || event;
    const delta = Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail)));
    if (delta > 0) {
      zoom *= 1.1;
    }
    else {
      zoom *= 1.0/1.1;
    }
    return false;
  }
  canvas.addEventListener('mousewheel', scrollZoom, false);
  canvas.addEventListener('DOMMouseScroll', scrollZoom, false);

  // drag mouse to shift center location
  let dragX = 0;
  let dragY = 0;
  canvas.addEventListener('dragstart', function(event) {
    dragX = event.screenX;
    dragY = event.screenY;
    // event.preventDefault();
  }, false);
  canvas.addEventListener('drag', function(event) {
    const dx = event.screenX - dragX;
    const dy = event.screenY - dragY;
    if ((dx == 0) && (dy == 0)) return; // no change
    dragX = event.screenX;
    dragY = event.screenY;
    if (Math.abs(dx) > 30) return; // too much
    if (Math.abs(dy) > 30) return; // too much
    // console.log('%d, %d', dx, dy)
    // todo:
    event.preventDefault();
  }, false);
}
