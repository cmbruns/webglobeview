"use strict";

var gl = null;
var vao = null;
var program = null;

var vertexShader = `#version 300 es

#line 10
const vec4 SCREEN_QUAD[4] = vec4[4](
  vec4(-1, -1, 0.5, 1),
  vec4( 1, -1, 0.5, 1),
  vec4(-1,  1, 0.5, 1),
  vec4( 1,  1, 0.5, 1));
const vec2 TEX_COORD[4] = vec2[4](
  vec2(0, 0),
  vec2(1, 0),
  vec2(0, 1),
  vec2(1, 1));

out vec2 tex_coord;

void main() {
  gl_Position = SCREEN_QUAD[gl_VertexID];
  tex_coord = TEX_COORD[gl_VertexID];
}
`;

var fragmentShader = `#version 300 es

#line 32
precision mediump float;
in vec2 tex_coord;
out vec4 outColor;

void main() {
  outColor = vec4(tex_coord, 1, 1);
}
`;

function initGL(canvas) {
  gl = canvas.getContext("webgl2");
  if (!gl) {
    alert("Could not initialise WebGL, sorry :-(");
    return;
  }
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
}

function drawScene() {
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindVertexArray(vao);
  gl.useProgram(program);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function globeviewStart() {
  var canvas = document.getElementById("globeview_canvas");
  initGL(canvas);
  gl.clearColor(0.0, 1.0, 0.0, 1.0);
  gl.disable(gl.DEPTH_TEST);
  drawScene();
}
