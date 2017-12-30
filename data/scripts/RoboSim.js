// Global variable definition var canvas;
var canvas;
var gl;
var shaderProgram;

// Buffers
var worldVertexPositionBuffer = null;
var worldVertexTextureCoordBuffer = null;

// Model-view and projection matrix and model-view matrix stack
var mvMatrixStack = [];
var mvMatrix = mat4.create();
var pMatrix = mat4.create();

// Variables for storing textures
var wallTexture;

// Variable that stores  loading state of textures.
var texturesLoaded = false;

// Keyboard handling helper variable for reading the status of keys
var currentlyPressedKeys = {};

// Variables for storing current position and speed
var pitch = 0;
var pitchRate = 0;
var yaw = 0;
var yawRate = 0;
var xPosition = 0;
var yPosition = 1.0;
var zPosition = 0;
var speed = 0;
var sideSpeed = 0;
var hasShot = false;
// Used to make us "jog" up and down as we move forward.
var joggingAngle = 0;

//Game over variable
var gameOver = false;
var intervalID;

//Robot (enemy) variables
var liveRobots = -1;
var arrayRobots = {};

function Robot(x,z) {
  this.xPosition = x;
  this.yPosition = 0; //vertical position (not needed)
  this.zPosition = z;
  this.yaw = 0;
  this.speed = 0.01; //increase this if (too easy)
}

//HUD variables
var enemiesKilled = 0;
var ctx;

// Helper variable for animation
var lastTime = 0;

//
// Matrix utility functions
//
// mvPush   ... push current matrix on matrix stack
// mvPop    ... pop top matrix from stack
// degToRad ... convert degrees to radians
//
function mvPushMatrix() {
  var copy = mat4.create();
  mat4.set(mvMatrix, copy);
  mvMatrixStack.push(copy);
}

function mvPopMatrix() {
  if (mvMatrixStack.length == 0) {
    throw "Invalid popMatrix!";
  }
  mvMatrix = mvMatrixStack.pop();
}

function degToRad(degrees) {
  return degrees * Math.PI / 180;
}

//
// initGL
//
// Initialize WebGL, returning the GL context or null if
// WebGL isn't available or could not be initialized.
//
function initGL(canvas) {
  var gl = null;
  try {
    // Try to grab the standard context. If it fails, fallback to experimental.
    gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    gl.viewportWidth = canvas.width;
    gl.viewportHeight = canvas.height;
  } catch(e) {}

  // If we don't have a GL context, give up now
  if (!gl) {
    alert("Unable to initialize WebGL. Your browser may not support it.");
  }
  return gl;
}

//
// getShader
//
// Loads a shader program by scouring the current document,
// looking for a script with the specified ID.
//
function getShader(gl, id) {
  var shaderScript = document.getElementById(id);

  // Didn't find an element with the specified ID; abort.
  if (!shaderScript) {
    return null;
  }
  
  // Walk through the source element's children, building the
  // shader source string.
  var shaderSource = "";
  var currentChild = shaderScript.firstChild;
  while (currentChild) {
    if (currentChild.nodeType == 3) {
        shaderSource += currentChild.textContent;
    }
    currentChild = currentChild.nextSibling;
  }
  
  // Now figure out what type of shader script we have,
  // based on its MIME type.
  var shader;
  if (shaderScript.type == "x-shader/x-fragment") {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderScript.type == "x-shader/x-vertex") {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    return null;  // Unknown shader type
  }

  // Send the source to the shader object
  gl.shaderSource(shader, shaderSource);

  // Compile the shader program
  gl.compileShader(shader);

  // See if it compiled successfully
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  }

  return shader;
}

//
// initShaders
//
// Initialize the shaders, so WebGL knows how to light our scene.
//
function initShaders() {
  var fragmentShader = getShader(gl, "shader-fs");
  var vertexShader = getShader(gl, "shader-vs");
  
  // Create the shader program
  shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);
  
  // If creating the shader program failed, alert
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert("Unable to initialize the shader program.");
  }
  
  // start using shading program for rendering
  gl.useProgram(shaderProgram);
  
  // store location of aVertexPosition variable defined in shader
  shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");

  // turn on vertex position attribute at specified position
  gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);

  // store location of aVertexNormal variable defined in shader
  shaderProgram.textureCoordAttribute = gl.getAttribLocation(shaderProgram, "aTextureCoord");

  // store location of aTextureCoord variable defined in shader
  gl.enableVertexAttribArray(shaderProgram.textureCoordAttribute);

  // store location of uPMatrix variable defined in shader - projection matrix 
  shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
  // store location of uMVMatrix variable defined in shader - model-view matrix 
  shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
  // store location of uSampler variable defined in shader
  shaderProgram.samplerUniform = gl.getUniformLocation(shaderProgram, "uSampler");
}

//
// setMatrixUniforms
//
// Set the uniforms in shaders.
//
function setMatrixUniforms() {
  gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, false, pMatrix);
  gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, mvMatrix);
}

//
// initTextures
//
// Initialize the textures we'll be using, then initiate a load of
// the texture images. The handleTextureLoaded() callback will finish
// the job; it gets called each time a texture finishes loading.
//
function initTextures() {
  wallTexture = gl.createTexture();
  wallTexture.image = new Image();
  wallTexture.image.onload = function () {
    handleTextureLoaded(wallTexture)
  }
  wallTexture.image.src = "data/textures/wall.png";
}

function handleTextureLoaded(texture) {
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  // Third texture usus Linear interpolation approximation with nearest Mipmap selection
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);

  gl.bindTexture(gl.TEXTURE_2D, null);

  // when texture loading is finished we can draw scene.
  texturesLoaded = true;
}

//
// handleLoadedWorld
//
// Initialisation of world 
//
function handleLoadedWorld(data) {
  var lines = data.split("\n");
  var vertexCount = 0;
  var vertexPositions = [];
  var vertexTextureCoords = [];
  for (var i in lines) {
    var vals = lines[i].replace(/^\s+/, "").split(/\s+/);
    if (vals.length == 5 && vals[0] != "//") {
      // It is a line describing a vertex; get X, Y and Z first
      vertexPositions.push(parseFloat(vals[0]));
      vertexPositions.push(parseFloat(vals[1]));
      vertexPositions.push(parseFloat(vals[2]));

      // And then the texture coords
      vertexTextureCoords.push(parseFloat(vals[3]));
      vertexTextureCoords.push(parseFloat(vals[4]));

      vertexCount += 1;
    }
  }

  worldVertexPositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, worldVertexPositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexPositions), gl.STATIC_DRAW);
  worldVertexPositionBuffer.itemSize = 3;
  worldVertexPositionBuffer.numItems = vertexCount;

  worldVertexTextureCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, worldVertexTextureCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexTextureCoords), gl.STATIC_DRAW);
  worldVertexTextureCoordBuffer.itemSize = 2;
  worldVertexTextureCoordBuffer.numItems = vertexCount;

  document.getElementById("loadingtext").textContent = "";
}

//
// loadWorld
//
// Loading world 
//
function loadWorld() {
  var request = new XMLHttpRequest();
  request.open("GET", "data/models/world.txt");
  request.onreadystatechange = function () {
    if (request.readyState == 4) {
      handleLoadedWorld(request.responseText);
    }
  }
  request.send();
}

//
// drawScene
//
// Draw the scene.
//
function drawScene() {
  // set the rendering environment to full canvas size
  gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
  // Clear the canvas before we start drawing on it.
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // If buffers are empty we stop loading the application.
  if (worldVertexTextureCoordBuffer == null || worldVertexPositionBuffer == null) {
    return;
  }
  
  // Establish the perspective with which we want to view the
  // scene. Our field of view is 45 degrees, with a width/height
  // ratio of 640:480, and we only want to see objects between 0.1 units
  // and 50 units away from the camera.
  mat4.perspective(60, gl.viewportWidth / gl.viewportHeight, 0.1, 50.0, pMatrix);

  // Set the drawing position to the "identity" point, which is
  // the center of the scene.
  mat4.identity(mvMatrix);

  // Now move the drawing position a bit to where we want to start
  // drawing the world.
  mat4.rotate(mvMatrix, degToRad(-pitch), [1, 0, 0]);
  mat4.rotate(mvMatrix, degToRad(-yaw), [0, 1, 0]);
  mat4.translate(mvMatrix, [-xPosition, -yPosition, -zPosition]);

  // Activate textures
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, wallTexture);
  gl.uniform1i(shaderProgram.samplerUniform, 0);

  // Set the texture coordinates attribute for the vertices.
  gl.bindBuffer(gl.ARRAY_BUFFER, worldVertexTextureCoordBuffer);
  gl.vertexAttribPointer(shaderProgram.textureCoordAttribute, worldVertexTextureCoordBuffer.itemSize, gl.FLOAT, false, 0, 0);

  // Draw the world by binding the array buffer to the world's vertices
  // array, setting attributes, and pushing it to GL.
  gl.bindBuffer(gl.ARRAY_BUFFER, worldVertexPositionBuffer);
  gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, worldVertexPositionBuffer.itemSize, gl.FLOAT, false, 0, 0);

  // Draw the cube.
  setMatrixUniforms();
  gl.drawArrays(gl.TRIANGLES, 0, worldVertexPositionBuffer.numItems);
}

//
// animate
//
// Called every time before redeawing the screen.
//
function animate() {
  var timeNow = new Date().getTime();
  if (lastTime != 0) {
    var elapsed = timeNow - lastTime;
    
    var xTmpSpeed = Math.sin(degToRad(yaw)) * speed * elapsed;
    var xTmpSideSpeed = Math.sin(degToRad(yaw-90)) * sideSpeed * elapsed;
    var zTmpSpeed = Math.cos(degToRad(yaw)) * speed * elapsed;
    var zTmpSideSpeed = Math.cos(degToRad(yaw-90)) * sideSpeed * elapsed;
    //create destroyed robots or notExisting ones
    repopulate();
    moveRobots();
    
    if (speed != 0 || sideSpeed != 0) {
      if (xPosition < 9.8 && xPosition > -9.8) {
        xPosition -= xTmpSpeed;
        xPosition -= xTmpSideSpeed;
        
        joggingAngle += elapsed * 0.6;
        yPosition = Math.sin(degToRad(joggingAngle)) / 20 + 0.4;
      } else if (xPosition < 9.9 && xTmpSpeed<0) {
        xPosition -= xTmpSpeed;
      } else if (xPosition < 9.9 && xTmpSideSpeed<0) {
        xPosition -= xTmpSideSpeed;
      } else if (xPosition > -9.9 && xTmpSpeed>0) {
        xPosition -= xTmpSpeed;
      } else if (xPosition > -9.9 && xTmpSideSpeed>0) {
        xPosition -= xTmpSideSpeed;
      }
      if (zPosition < 9.8 && zPosition > -9.8) {
        zPosition -= zTmpSpeed;
        zPosition -= zTmpSideSpeed;
      } else if (zPosition < 9.9 && zTmpSpeed<0) {
        zPosition -= zTmpSpeed;
      } else if (zPosition < 9.9 && zTmpSideSpeed<0) {
        zPosition -= zTmpSideSpeed;
      } else if (zPosition > -9.9 && zTmpSpeed>0) {
        zPosition -= zTmpSpeed;
      } else if (zPosition > -9.9 && zTmpSideSpeed>0) {
        zPosition -= zTmpSideSpeed;
      }
    }

    yaw += yawRate * elapsed;
    pitch += pitchRate * elapsed;

  }
  lastTime = timeNow;
}

//
// Keyboard handling helper functions
//
// handleKeyDown    ... called on keyDown event
// handleKeyUp      ... called on keyUp event
//
function handleKeyDown(event) {
  // storing the pressed state for individual key
  //console.log(event.keyCode);
  currentlyPressedKeys[event.keyCode] = true;
}

function handleKeyUp(event) {
  // reseting the pressed state for individual key
  currentlyPressedKeys[event.keyCode] = false;
}

//
// handleKeys
//
// Called every time before redeawing the screen for keyboard
// input handling. Function continuisly updates helper variables.
//
function handleKeys() {
  
  //REMOVE IN FUTURE LEAVE FOR NOW FOR TESTING
  if (currentlyPressedKeys[33]) {
    // Page Up
    pitchRate = 0.1;
  } else if (currentlyPressedKeys[34]) {
    // Page Down
    pitchRate = -0.1;
  } else {
    pitchRate = 0;
  }
  //END REMOVAL
  
  //Look left/right
  if (currentlyPressedKeys[81]) {
    yawRate = 0.15;
  } else if (currentlyPressedKeys[69]) {
    yawRate = -0.15;
  } else {
    yawRate = 0;
  }
  
  //Shoot
  if (currentlyPressedKeys[32]) {
    if(!hasShot) {
      //TO-DO call shoot function
      console.log("X pos: "+xPosition+" , Y pos: "+yPosition+" ,Z pos: "+zPosition);
      //console.log("PEEEW");
      hud();
      hasShot = true;
    }
  } else {
    hasShot = false;
  }
  
  //Side movement (A,D ali leva, desna puscia)
  if (currentlyPressedKeys[37] || currentlyPressedKeys[65]) {
    sideSpeed = -0.004;
  } else if (currentlyPressedKeys[39] || currentlyPressedKeys[68]) {
    sideSpeed = 0.004;
  } else {
    sideSpeed = 0;
  }

  if (currentlyPressedKeys[38] || currentlyPressedKeys[87]) {
    // Up cursor key or W
    speed = 0.004;
  } else if (currentlyPressedKeys[40] || currentlyPressedKeys[83]) {
    // Down cursor key
    speed = -0.004;
  } else {
    speed = 0;
  }
}
//HUD
function hud() {
  ctx.font="30px Arial";
  ctx.fillStyle = "#ff0000";
  ctx.clearRect(0,0,1280,720);
  ctx.fillText("ENEMIES KILLED: "+enemiesKilled,30,50);
}

//call this when game is over
function hudGameOver() {
  ctx.clearRect(0,0,1280,720);
  ctx.font="130px Arial";
  ctx.fillStyle = "#ff7500";
  ctx.fillText("GAME OVER",220,300);
  ctx.font="30px Arial";
  ctx.fillStyle = "#ff0000";
  ctx.fillText("YOU KILLED: "+enemiesKilled+" ENEMIES",450,500);
  clearInterval(intervalID);
}


//
// start
//
// Called when the canvas is created to get the ball rolling.
// Figuratively, that is. There's nothing moving in this demo.
//
function start() {
  canvas = document.getElementById("glcanvas");
  //initiate HUD
  var tmp = document.getElementById("hud");
  ctx = tmp.getContext("2d");
  hud();
  
  gl = initGL(canvas);      // Initialize the GL context

  // Only continue if WebGL is available and working
  if (gl) {
    gl.clearColor(0.0, 0.0, 0.0, 1.0);                      // Set clear color to black, fully opaque
    gl.clearDepth(1.0);                                     // Clear everything
    gl.enable(gl.DEPTH_TEST);                               // Enable depth testing
    gl.depthFunc(gl.LEQUAL);                                // Near things obscure far things

    // Initialize the shaders; this is where all the lighting for the
    // vertices and so forth is established.
    initShaders();
    
    // Next, load and set up the textures we'll be using.
    initTextures();

    // Initialise world objects
    loadWorld();

    // Bind keyboard handling functions to document handlers
    document.onkeydown = handleKeyDown;
    document.onkeyup = handleKeyUp;
    
    // Set up to draw the scene periodically.
    intervalID = setInterval(function() {
      if (texturesLoaded) { // only draw scene and animate when textures are loaded.
        requestAnimationFrame(animate);
        handleKeys();
        drawScene();
      }
    }, 15);
  }
}

//checks if the game is over
// further: check if one of the four robots is 0.7 near player on x or z axis
function gameOverCheck() {
  
  hudGameOver();
}

//Robot functions
//creates new robos, alive ones are left to live another day :)
function repopulate() {
  if (arrayRobots[0] == null) {
    arrayRobots[0] = new Robot(10,10);
  }
  if (arrayRobots[1] == null) {
    arrayRobots[1] = new Robot(10,-10);
  }
  if (arrayRobots[2] == null) {
    arrayRobots[2] = new Robot(-10,10);
  }
  if (arrayRobots[3] == null) {
    arrayRobots[3] = new Robot(-10,-10);
  }
}
function moveRobots() {
  
  console.clear();
  console.log("xPosition: "+arrayRobots[0].xPosition+", yPosition: "+arrayRobots[0].xPosition);
}