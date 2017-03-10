"use strict";

var gl = null;
var vao = null;
var program = null;
var world_texture = null;
var zoom_loc = 0;
var zoom = 1.0; // half-screens per radian

var vertexShader = `#version 300 es
#line 12
const vec4 SCREEN_QUAD[4] = vec4[4](
  vec4(-1, -1, 0.5, 1),
  vec4( 1, -1, 0.5, 1),
  vec4(-1,  1, 0.5, 1),
  vec4( 1,  1, 0.5, 1));
// todo: scale
const vec2 TEX_COORD[4] = vec2[4](
  vec2(-1, -1),
  vec2( 1, -1),
  vec2(-1,  1),
  vec2( 1,  1));

uniform float zoom; // half-screens per radian

out vec2 tex_coord;

void main() {
  gl_Position = SCREEN_QUAD[gl_VertexID];
  tex_coord = TEX_COORD[gl_VertexID] / zoom;
}
`;

var fragmentShader = `#version 300 es
#line 36
precision mediump float;
uniform sampler2D world_texture;
in vec2 tex_coord;
out vec4 outColor;

vec2 longlatFromXyz(in vec3 xyz) {
  float r = length(xyz.xz);
  return vec2(atan(xyz.x, xyz.z),
              atan(xyz.y, r));
}

vec3 xyzFromLonglat(in vec2 longlat) {
  float s = cos(longlat.y);
  return vec3(s * sin(longlat.x), 
              sin(longlat.y),
              s * cos(longlat.x));
}

// Convert from input equirectangular image, to unit sphere surface xyz
vec2 texCoordFromXyz(in vec3 xyz) {
  vec2 longlat = longlatFromXyz(xyz);
  const float PI = 3.14159265359;
  vec2 uv = vec2(
    longlat.x / PI * 0.5 + 0.5,
    -longlat.y / PI + 0.5);
  return uv;
}

void main() {
  // orthographic
  float y = tex_coord.y;
  float x = tex_coord.x;
  float z = 1.0 - x*x - y*y;
  if (z < 0.0) discard;
  z = sqrt(z);

  vec2 uv = texCoordFromXyz(vec3(x, y, z));
  outColor = 
      // vec4(uv, 1, 1);
      texture(world_texture, uv);
}
`;

function resize(canvas) {
  // Lookup the size the browser is displaying the canvas.
  var displayWidth  = ~~(0.9 * canvas.clientWidth);
  var displayHeight = ~~(0.9 * canvas.clientHeight);

  // Check if the canvas is not the same size.
  if (canvas.width  != displayWidth ||
      canvas.height != displayHeight) {

    // Make the canvas the same size
    canvas.width  = displayWidth;
    canvas.height = displayHeight;
  }
}

function initGL(canvas) {
  gl = canvas.getContext("webgl2");
  if (!gl) {
    alert("Could not initialise WebGL, sorry :-(");
    return;
  }
  gl.clearColor(0.0, 1.0, 0.0, 1.0);
  gl.disable(gl.DEPTH_TEST);
  vao = gl.createVertexArray(); // webgl2 only
  gl.bindVertexArray(vao);
  var vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vertexShader);
  gl.compileShader(vs);
  // Check if it compiled
  var success = gl.getShaderParameter(vs, gl.COMPILE_STATUS);
  if (!success) {
    // Something went wrong during compilation; get the error
    throw "could not compile shader:" + gl.getShaderInfoLog(vs);
  }
  var fs = gl.createShader(gl.FRAGMENT_SHADER);
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
  var world_texture_loc = gl.getUniformLocation(program, 'world_texture');
  zoom_loc = gl.getUniformLocation(program, 'zoom');
  gl.useProgram(program);
  gl.uniform1i(world_texture_loc, 0);
  gl.uniform1f(zoom_loc, zoom);
  world_texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, world_texture);
}

function drawScene() {
  resize(gl.canvas);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindVertexArray(vao);
  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, world_texture);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  requestAnimationFrame(drawScene);
}

function globeviewStart() {
  var canvas = document.getElementById("globeview_canvas");
  initGL(canvas);
  var image = new Image();
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
}
