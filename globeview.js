"use strict";

function main() {
  var canvas = document.getElementById("canvas");
  var gl = canvas.getContext("webgl");
  if (!gl) {
    return;
  }

  requestAnimationFrame(drawScene);

  function resize(canvas) {
    // Lookup the size the browser is displaying the canvas.
    var displayWidth  = canvas.clientWidth;
    var displayHeight = canvas.clientHeight;

    // Check if the canvas is not the same size.
    if (canvas.width  != displayWidth ||
        canvas.height != displayHeight) {

      // Make the canvas the same size
      canvas.width  = displayWidth;
      canvas.height = displayHeight;
    }
  }

  function drawScene() {
     resize(gl.canvas);
     gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
     gl.clear(gl.COLOR_BUFFER_BIT);
     requestAnimationFrame(drawScene);
  }

}