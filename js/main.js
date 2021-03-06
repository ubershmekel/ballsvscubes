var controls;


requirejs(['libs/eventEmitter/EventEmitter.js', 'js/clientEvents.js'], function(EventEmitter, clientEvents) {
    var settings = {
        soundsEnabled: false
    };
    var sphereShape;
    var sphereBody;
    var world;
    var physicsMaterial;
    var cannonBallMat;
    var balls;
    var ballMeshes;
    var boxes;
    var boxMeshes;
    var light;

    var camera, scene, renderer;
    var audioListener;
    var planeGeometry, material, mesh;
    var lastFrameTime = Date.now();

    var blocker = document.getElementById( 'blocker' );
    var instructions = document.getElementById( 'instructions' );
    
    var ee = new EventEmitter();

    var stats;
    var initStats = function() {

        stats = new Stats();
        stats.setMode( 0 ); // 0: fps, 1: ms, 2: mb

        // align top-left
        stats.domElement.style.position = 'absolute';
        stats.domElement.style.left = '0px';
        stats.domElement.style.top = '0px';

        document.body.appendChild( stats.domElement );
    };

    var colors = {};
    colors.green = 0x99ff99;
    colors.red =   0xff9999;
    colors.blue =  0x9999ff;
    colors.skyBlue = 0xddddff;
    var redMaterial = new THREE.MeshLambertMaterial( { color: colors.red } );
    var blueMaterial = new THREE.MeshLambertMaterial( { color: colors.blue } );

    var initialBoxesCount = 40;

    var initControls = function() {
        keyboard.keyUpCallbacks[keyboard.keyCodes.r] = function() {
            resetGame();
        };

        keyboard.keyUpCallbacks[keyboard.keyCodes.m] = function() {
            settings.soundsEnabled = !settings.soundsEnabled;
        };

        controls = new PointerLockControls( camera , sphereBody );
        scene.add( controls.getObject() );
    }

    function initCannon() {
        game.start = Date.now();

        // Setup our world
        world = new CANNON.World();
        world.quatNormalizeSkip = 0;
        world.quatNormalizeFast = false;

        var solver = new CANNON.GSSolver();

        world.defaultContactMaterial.contactEquationStiffness = 1e9;
        world.defaultContactMaterial.contactEquationRelaxation = 4;

        solver.iterations = 7;
        solver.tolerance = 0.1;
        var split = true;
        if(split)
            world.solver = new CANNON.SplitSolver(solver);
        else
            world.solver = solver;

        world.gravity.set(0, -20, 0);
        world.broadphase = new CANNON.NaiveBroadphase();

        // Create a slippery material (friction coefficient = 0.0)
        physicsMaterial = new CANNON.Material("slipperyMaterial");
        var physicsContactMaterial = new CANNON.ContactMaterial(physicsMaterial,
                                                                physicsMaterial,
                                                                0.0, // friction coefficient
                                                                0.3  // restitution
                                                                );
        
        // We must add the contact materials to the world
        world.addContactMaterial(physicsContactMaterial);
        cannonBallMat = new CANNON.Material();
        var cannonBallMatContact = new CANNON.ContactMaterial(physicsMaterial, cannonBallMat, { friction: 0.0, restitution: 0.8 });
        world.addContactMaterial(cannonBallMatContact);

        // Create a sphere for the player's body
        var mass = 5, radius = 1.3;
        sphereShape = new CANNON.Sphere(radius);
        sphereBody = new CANNON.Body({ mass: mass });
        sphereBody.gameType = bodyTypes.player;
        sphereBody.addShape(sphereShape);
        sphereBody.position.set(0,5,0);
        sphereBody.linearDamping = 0.9;
        world.add(sphereBody);
    }

    var rendererId = "renderer";
    var initScene = function() {
        camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
        audioListener = new THREE.AudioListener();
        camera.add( audioListener );

        scene = new THREE.Scene();
        scene.fog = new THREE.Fog( colors.skyBlue, 0, 500 );

        var ambient = new THREE.AmbientLight( 0x555555 );
        scene.add( ambient );

        light = new THREE.SpotLight( 0xffffff );
        light.position.set( 0, 60, 0);
        light.target.position.set( 0, 0, 0 );
        if (true) {
            light.castShadow = true;

            light.shadow.camera.near = 30;
            light.shadow.camera.far = 120;
            light.shadow.camera.fov = 70;

            light.shadowMapBias = 0.1;
            light.shadowMapDarkness = 0.7;
            light.shadow.mapSize.width = 512*4;
            light.shadow.mapSize.height = 512*4;
            light.shadowMaptype = THREE.BasicShadowMap;
            //light.shadowMaptype = THREE.PCFShadowMap;
            //light.shadowMaptype = THREE.PCFSoftShadowMap;

            //light.shadowCameraVisible = true;
            //scene.add( new THREE.CameraHelper( light.shadow.camera ) );
        }
        scene.add( light );

        renderer = new THREE.WebGLRenderer();
        renderer.shadowMap.enabled = true;
        renderer.shadowMapSoft = true;
        renderer.setSize( window.innerWidth, window.innerHeight );
        renderer.setClearColor( scene.fog.color, 1 );

        renderer.domElement.id = rendererId;
        document.body.appendChild( renderer.domElement );
    }

    var game = {}

    var initPlane = function() {
        game.createPlane = function() {
            var groundShape = new CANNON.Plane();
            var groundBody = new CANNON.Body({ mass: 0, material: physicsMaterial });
            groundBody.gameType = bodyTypes.ground;
            groundBody.addShape(groundShape);
            groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0),-Math.PI/2);
            world.add(groundBody);
            game.createPlaneDone(groundBody);
        };
        
        game.createPlaneDone = function() {
            // floor
            planeGeometry = new THREE.PlaneGeometry( 200, 200, 50, 50 );
            planeGeometry.applyMatrix( new THREE.Matrix4().makeRotationX( - Math.PI / 2 ) );

            material = new THREE.MeshLambertMaterial( { color: colors.green } );

            mesh = new THREE.Mesh( planeGeometry, material );
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            scene.add( mesh );
        };
        
        game.createPlane();
    }

    var isBoxFallen = function(boxBody) {
        return Math.abs(boxBody.quaternion.x) > 0.5 || Math.abs(boxBody.quaternion.z) > 0.5;
    }

    var bodyTypes = {
        box: "box",
        ball: "ball",
        ground: "ground",
        player: "player"
    }

    function init() {
        initPlane();
        balls = [];
        ballMeshes = [];
        boxes = [];
        boxMeshes = [];

        var halfExtents = new CANNON.Vec3(1, 3, 1);
        var boxGeometry = new THREE.BoxGeometry(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2);

        // Add boxes
        var boxShape = new CANNON.Box(halfExtents);
        game.createBoxDone = function (boxBody) {
            var boxMesh = new THREE.Mesh( boxGeometry, redMaterial );
            scene.add(boxMesh);
            boxMesh.position.set(boxBody.x, boxBody.y, boxBody.z);
            boxMesh.castShadow = true;
            boxMesh.receiveShadow = true;
            boxMeshes.push(boxMesh);
            boxes.push(boxBody);
        };
        game.createBox = function () {
            var x = (Math.random()-0.5) * 60;
            var y = halfExtents.y + 10;
            var z = (Math.random()-0.5) * 60;
            var boxBody = new CANNON.Body({ mass: 5 });
            boxBody.gameType = bodyTypes.box;
            boxBody.addShape(boxShape);
            world.add(boxBody);
            boxBody.position.set(x,y,z);
            game.createBoxDone(boxBody);
        };
        
        for(var i = 0; i < initialBoxesCount; i++){
            game.createBox();
        }
    }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize( window.innerWidth, window.innerHeight );
    }

    var dt = 1/60;
    function animate() {
        stats.begin();
        requestAnimationFrame( animate );
        game.tick();
        game.tickGraphics();
        lastFrameTime = Date.now();
        stats.end();
    }

    ee.on(clientEvents.names.pause, function() {
        //sounds.bubbles.pause();
        //Howler.mute();
        // No need because all our sounds are impulses
    });

    ee.on(clientEvents.names.unpause, function() {
        //sounds.bubbles.play();
        //Howler.unmute();
        // No need because all our sounds are impulses
    });

    game.tick = function() {
        if(!controls.enabled){
            return;
        }

        world.step(dt);
        controls.update( Date.now() - lastFrameTime );
        
        if(isMouseDown) {
            shootBall();
            if(settings.soundsEnabled)
                sounds.bubbles.setVolume(0.5);
        } else {
            sounds.bubbles.setVolume(0);
        }
        
        for(var i = 0; i < boxes.length; i++){
            if(isBoxFallen(boxes[i])) {
                boxes[i].fallen = true;
            }
        }
        var everFallen = 0;
        for(var i = 0; i < boxes.length; i++) {
            if(boxes[i].fallen)
                everFallen += 1;
        }
        game.boxesLeft = boxes.length - everFallen;
        
        if (game.boxesLeft == 0) {
            game.duration = Date.now() - game.start;
        }
    }

    var endGame = function(duration) {
        if(scene.gameOver)
            // run this once
            return;
        scene.gameOver = true;
        var div = document.createElement('div');
        div.className = 'centeredXY';
        div.id = 'gameOver';
        div.innerHTML = 'You have defeated the red blocks in ' + duration / 1000 + ' seconds';
        document.body.appendChild(div);
        
        setTimeout(function() { div.parentNode.removeChild(div); }, 4000);
    };

    game.tickGraphics = function() {
        // Update ball positions
        for(var i=0; i < balls.length; i++){
            ballMeshes[i].position.copy(balls[i].position);
            ballMeshes[i].quaternion.copy(balls[i].quaternion);
        }

        // Update box positions
        for(var i=0; i < boxes.length; i++){
            boxMeshes[i].position.copy(boxes[i].position);
            boxMeshes[i].quaternion.copy(boxes[i].quaternion);
            if(boxes[i].fallen) {
                boxMeshes[i].material = blueMaterial;
            }
        }
        
        if (game.boxesLeft == 0) {
            endGame(game.duration);
        } 
        document.getElementById("blocksRemaining").innerHTML = game.boxesLeft;
        renderer.render( scene, camera );
    }

    var ballShape = new CANNON.Sphere(0.2);
    var ballGeometry = new THREE.SphereGeometry(ballShape.radius, 32, 32);
    var shootDirection = new THREE.Vector3();
    var shootVelo = 15;
    //var projector = new THREE.Projector();
    function getShootDir(targetVec) {
        var vector = targetVec;
        targetVec.set(0,0,1);
        //projector.unprojectVector(vector, camera);
        vector.unproject(camera);
        var ray = new THREE.Ray(sphereBody.position, vector.sub(sphereBody.position).normalize() );
        targetVec.copy(ray.direction);
    }

    var isMouseDown = false;
    window.addEventListener("mousedown",function(e) {
        isMouseDown = true;
    });
    window.addEventListener("mouseup",function(e) {
        isMouseDown = false;
    });

    var maxBalls = 100;

    var shootBall = function() {
        if(balls.length >= maxBalls) {
            var bbody = balls.shift();
            world.remove(bbody);
            var bmesh = ballMeshes.shift();
            scene.remove(bmesh);
        }
        var x = sphereBody.position.x;
        var y = sphereBody.position.y;
        var z = sphereBody.position.z;
        var ballBody = new CANNON.Body({ mass: 3, material: cannonBallMat });
        ballBody.gameType = bodyTypes.ball;
        ballBody.addShape(ballShape);
        ballBody.linearDamping = 0.01;
        var ballMesh = new THREE.Mesh( ballGeometry, blueMaterial );
        world.add(ballBody);
        scene.add(ballMesh);
        ballMesh.castShadow = true;
        ballMesh.receiveShadow = true;
        balls.push(ballBody);
        ballMeshes.push(ballMesh);
        getShootDir(shootDirection);
        ballBody.velocity.set(  shootDirection.x * shootVelo,
                                shootDirection.y * shootVelo,
                                shootDirection.z * shootVelo);

        // Move the ball outside the player sphere
        x += shootDirection.x * (sphereShape.radius*1.02 + ballShape.radius);
        y += shootDirection.y * (sphereShape.radius*1.02 + ballShape.radius);
        z += shootDirection.z * (sphereShape.radius*1.02 + ballShape.radius);
        ballBody.position.set(x,y,z);
        ballMesh.position.set(x,y,z);
        
        ballBody.addEventListener("collide", function(e) {
            var targetType = e.body.gameType;
            if(settings.soundsEnabled && (targetType == bodyTypes.ground || targetType == bodyTypes.box)) {
                var contactNormal = e.contact.ni;
                var contactPower = ballBody.velocity.dot(contactNormal);
                if(contactPower > 2) {
                    // `2` because that seems when the impact should be silent.
                    //console.log(contactPower);
                    var volume = contactPower / 20.0;
                    var bounceSound = new THREE.PositionalAudio( audioListener );
                    ///sounds[soundNames.ballBounce] = bounceSound;
                    var variation = Math.floor(Math.random() * 2);
                    var url = 'audio/bounce' + variation + '.ogg';
                    bounceSound.load(url);
                    
                    // `setRefDistance` made all the distances sound the same
                    //bounceSound.setRefDistance( 20 );
                    bounceSound.autoplay = true;
                    bounceSound.setVolume(volume);
                    ballMesh.add(bounceSound);
                    //var instance = sounds.ballBounce.play();
                    //instance.volume(volume);
                    //instance.pos3d(ballBody.position.x, ballBody.position.y, ballBody.position.z );
                }
                // && Math.abs(ballBody.velocity.y) > 5) {
                //console.log('bounce', e.contact.ri, e.contact.rj, e.contact.ni)
                //console.log('bounce', , e.contact.ni);
                //console.log("The sphere just collided with the ground!", ballBody.velocity);
                //console.log("Collided with body:", e.body);
                //console.log("Contact between bodies:", e.contact);
            }
        });
    };

    var clearScene = function(scene) {
        var renderer = document.getElementById(rendererId);
        renderer.parentNode.removeChild(renderer);
        var i;
        for(i=0; i < scene.children.length; i++){
            var obj = scene.children[i];
            scene.remove(obj);
        }
    }

    var sounds = {};
    var soundNames = {
        bubbles: 'bubbles',
        ballBounce: 'ballBounce'
    };
    
    var loadSounds = function() {
        var bubblesSound = new THREE.Audio( audioListener );
        bubblesSound.load('audio/bubbles.ogg');
        bubblesSound.setVolume(0);
        bubblesSound.autoplay = true;
        bubblesSound.setLoop(true);
        sounds[soundNames.bubbles] = bubblesSound;
        
        //sounds[soundNames.bubbles] = new Howl({
        //    urls: ['audio/bubbles.ogg'],
        //    loop: true
        //});
        //sounds[soundNames.ballBounce] = new Howl({
        //    urls: ['audio/tennis_ball_single_bounce_floor_001.mp3'],
        //    loop: false
        //});
        //mesh1.add( sound1 );
    }

    var initOnce = function() {
        initStats();
        keyboard.init();
        initScene();
        loadSounds();
        initCannon();
        init();
        initControls();
        requirePointerLock(ee);
        window.addEventListener( 'resize', onWindowResize, false );
    }

    var resetGame = function() {
        clearScene(scene);
        initScene();
        initCannon();
        init();
        initControls();
    }

    initOnce();
    animate();

});
