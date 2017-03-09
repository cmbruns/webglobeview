"use strict";

var gl = null;

function initGL(canvas) {
  gl = canvas.getContext("webgl");
  if (!gl) {
    alert("Could not initialise WebGL, sorry :-(");
    return;
  }
}

function drawScene() {
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

function globeviewStart() {
  var canvas = document.getElementById("globeview_canvas");
  initGL(canvas);
  gl.clearColor(0.0, 1.0, 0.0, 1.0);
  gl.disable(gl.DEPTH_TEST);
  drawScene();
}

