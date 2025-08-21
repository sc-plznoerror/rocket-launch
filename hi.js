(() => {
    const {
    Scene, PerspectiveCamera, WebGLRenderer, Color, AmbientLight, DirectionalLight,
    Mesh, MeshPhongMaterial, CylinderGeometry, ConeGeometry, PlaneGeometry, AxesHelper,
    Group, BufferGeometry, Float32BufferAttribute, LineBasicMaterial, Line,
    Vector3, Quaternion, Sprite, SpriteMaterial, Texture, CanvasTexture
  } = THREE;
  const world = new CANNON.World();
  world.gravity.set(0, -9.8, 0);
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 10;

  const scene = new Scene();
  scene.background = new Color(0xeef7ff);

  const camera = new PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.set(0, 20, 40);

  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  scene.add(new AmbientLight(0xffffff, 0.6));
  const directional = new DirectionalLight(0xffffff, 0.8);
  directional.position.set(20, 40, 20);
  scene.add(directional);

  scene.add(new AxesHelper(5));

  // 바닥 평면 (200x200)
  const floorGeo = new PlaneGeometry(400, 400);
  const floorMat = new MeshPhongMaterial({color: '#6c8'});
  const floorMesh = new Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI/2;
  floorMesh.position.y = 0;
  scene.add(floorMesh);

  // 물리 바닥
  const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  groundBody.quaternion.setFromEuler(-Math.PI/2, 0, 0);
  world.addBody(groundBody);

  // 1m 단위 축 표시용 그룹
  const axisGroup = new Group();
  scene.add(axisGroup);

  // 축 눈금과 숫자 표시 함수
  function createAxisMarks() {
    const markLength = 0.3;
    const fontSize = 32; // 캔버스 글자 크기

    // 재사용 가능한 캔버스 텍스쳐 생성 함수
    function createTextTexture(text) {
      const canvas = document.createElement('canvas');
      const size = 128;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.font = `${fontSize}px Arial`;
      ctx.fillStyle = 'black';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.clearRect(0, 0, size, size);
      ctx.fillText(text, size/2, size/2);
      return new CanvasTexture(canvas);
    }

    for(let i=0; i<=200; i++) {
      // X축 방향 눈금선 (Z=0선상, Y=0.01로 약간 띄워서 바닥과 겹치지 않게)
      {
        const geo = new BufferGeometry();
        const positions = new Float32Array([
          i, 0.01, 0,
          i, 0.01, markLength
        ]);
        geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
        const line = new Line(geo, new LineBasicMaterial({color: 0x000000}));
        axisGroup.add(line);

        // 텍스트: i 숫자
        if(i % 10 === 0) { // 10m마다 숫자 표시
          const spriteMat = new SpriteMaterial({ map: createTextTexture(i.toString()), transparent:true });
          const sprite = new Sprite(spriteMat);
          sprite.scale.set(1.5, 0.75, 1);
          sprite.position.set(i, 0.01, markLength + 1);
          axisGroup.add(sprite);
        }
      }

      // Z축 방향 눈금선 (X=0선상, Y=0.01로 약간 띄움)
      {
        const geo = new BufferGeometry();
        const positions = new Float32Array([
          0, 0.01, i,
          markLength, 0.01, i
        ]);
        geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
        const line = new Line(geo, new LineBasicMaterial({color: 0x000000}));
        axisGroup.add(line);

        // 텍스트: i 숫자 (10m마다)
        if(i % 10 === 0) {
          const spriteMat = new SpriteMaterial({ map: createTextTexture(i.toString()), transparent:true });
          const sprite = new Sprite(spriteMat);
          sprite.scale.set(1.5, 0.75, 1);
          sprite.position.set(markLength + 1, 0.01, i);
          axisGroup.add(sprite);
        }
      }
    }
  }

  createAxisMarks();
  let rocket = class{
    constructor(speed, angleXY, angleZ, launchBtn, clearBtn, maxHeightSpan, rangeSpan, windDir, windSpeed, bodycolor, conecolor){
      this.speed = speed;
      this.angleXY = angleXY;
      this.angleZ = angleZ;
      this.launchBtn = launchBtn;
      this.clearBtn = clearBtn;
      this.maxHeightSpan = maxHeightSpan;
      this.rangeSpan = rangeSpan;
      this.windDir = windDir;
      this.windSpeed = windSpeed;
      this.bodycolor = bodycolor;
      this.conecolor = conecolor;

      this.rocketBody = null;
      this.rocketMesh = null;
      this.firstTouchPosition = null;
      this.touchedGround = false;
      this.bodyHeight = 1.0;
      this.bodyRadius = 0.15;
      this.coneHeight = 0.4;
      this.coneRadius = this.bodyRadius;
      this.li = []
      this.maxHeight = 0;
      this.launched = false;
      this.landed = false;
      this.landTime = 0;
      this.isMaxheight = false;
      this.originPosition = new Vector3(0, 0.25, 0)
      this.mass = 0.1;
      this.Cd = 0.75;
      this.rho = 1.225;
      this.area = 0.01;
    }
    createRocket() {
      if (this.rocketBody) {
        world.removeBody(this.rocketBody);
        scene.remove(this.rocketMesh);
        this.rocketBody = null;
        this.this.rocketMesh = null;
        this.firstTouchPosition = null;
        this.touchedGround = false;
      }
  
      this.rocketBody = new CANNON.Body({
        mass: this.mass,
        linearDamping: 0,
        angularDamping: 0,
        type: CANNON.Body.DYNAMIC
      });
  
      this.rocketBody.inertia.set(0.01, 0.02, 0.01);
      this.rocketBody.invInertia.set(
        1/this.rocketBody.inertia.x,
        1/this.rocketBody.inertia.y,
        1/this.rocketBody.inertia.z
      );
  
      const cylinderShape = new CANNON.Cylinder(this.bodyRadius, this.bodyRadius, this.bodyHeight, 16);
      const quat = new CANNON.Quaternion();
      quat.setFromEuler(Math.PI / 2, 0, 0);
      this.rocketBody.addShape(cylinderShape, new CANNON.Vec3(0, this.bodyHeight/2, 0), quat);  
  
      const sphereShape = new CANNON.Sphere(this.coneRadius);
      this.rocketBody.addShape(sphereShape, new CANNON.Vec3(0, this.bodyHeight + this.coneHeight/2, 0));
  
      this.rocketBody.position.copy(this.originPosition);
      this.rocketBody.velocity.set(0,0,0);
      this.rocketBody.angularVelocity.set(0,0,0);
  
      world.addBody(this.rocketBody);
  
      this.rocketMesh = new Group();
  
      const bodyGeometry = new CylinderGeometry(this.bodyRadius, this.bodyRadius, this.bodyHeight, 16);
      const bodyMaterial = new MeshPhongMaterial({ color: this.bodycolor });
      const bodyMesh = new Mesh(bodyGeometry, bodyMaterial);
      bodyMesh.position.y = this.bodyHeight / 2;
      this.rocketMesh.add(bodyMesh);
  
      const coneGeometry = new ConeGeometry(this.coneRadius, this.coneHeight, 16);
      const coneMaterial = new MeshPhongMaterial({ color: this.conecolor });
      const coneMesh = new Mesh(coneGeometry, coneMaterial);
      coneMesh.position.y = this.bodyHeight + this.coneHeight / 2;
      this.rocketMesh.add(coneMesh);
  
      scene.add(this.rocketMesh);
  
      this.maxHeight = 0;
      this.maxHeightSpan.textContent = '0';
      this.rangeSpan.textContent = '0';
      this.launched = true;
      this.landed = false;
      this.landTime = 0;
  
      this.setRocketInitialDirection();
  
      const speed = parseFloat(this.speed);
      const angleXY = parseFloat(this.angleXY) * Math.PI/180;
      const angleZ = parseFloat(this.angleZ) * Math.PI/180;
  
      const vx = speed * Math.cos(angleXY) * Math.cos(angleZ);
      const vy = speed * Math.sin(angleXY);
      const vz = speed * Math.cos(angleXY) * Math.sin(angleZ);
  
      this.rocketBody.velocity.set(vx, vy, vz);
    }
    setRocketInitialDirection() {
      const angleXY = parseFloat(this.angleXY) * Math.PI/180;
      const angleZ = parseFloat(this.angleZ) * Math.PI/180;
      
      const fromDir = new Vector3(0, 1, 0);
      const targetDir = new Vector3(
        Math.cos(angleXY) * Math.cos(angleZ),
        Math.sin(angleXY),
        Math.cos(angleXY) * Math.sin(angleZ)
      ).normalize();
      
      const quat = new Quaternion().setFromUnitVectors(fromDir, targetDir);
      
      if(this.rocketMesh) {
        this.rocketMesh.quaternion.copy(quat);
      }
    }
    
    animate() {
      requestAnimationFrame(this.animate.bind(this));
  
      if (this.rocketBody && this.launched) {
        if (!this.landed) {
          this.applyForces();
          world.step(1/60);
  
          this.rocketMesh.position.copy(this.rocketBody.position);
          this.updateRocketRotation();
  
          // 카메라 부드럽게 로켓 뒤쪽 위를 따라감
          const desiredCamPos = new Vector3(
            this.rocketBody.position.x + 10,
            this.rocketBody.position.y + 5,
            this.rocketBody.position.z + 10
          );
          camera.position.lerp(desiredCamPos, 0.05);
          camera.lookAt(this.rocketMesh.position);
  
          // 최고 높이 갱신
          if (this.rocketBody.position.y > this.maxHeight) {
            this.maxHeight = this.rocketBody.position.y;
            this.maxHeightSpan.textContent = this.maxHeight.toFixed(2);
          }
  
          else {
            this.isMaxheight = true;
            // console.log(this.rocketBody.position.y);
            // console.log("12");
          }
          
          // 땅 닿은 최초 위치 기록
          if (this.rocketBody.position.y <= 1.3 && !this.touchedGround && this.isMaxheight) {
            this.touchedGround = true;
            this.landed = true;
            this.firstTouchPosition = this.rocketMesh.position.clone();
            // console.log("landed")
            const markerGeometry = new THREE.SphereGeometry(0.2, 32); // 반지름 0.2, 세그먼트 32
            const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // 빨간색
            const marker = new THREE.Mesh(markerGeometry, markerMaterial);
            marker.position.set(this.rocketBody.position.x, 0.2, this.rocketBody.position.z); // 원하는 위치로 설정
            scene.add(marker);
          }
  
          // 착륙 감지: 땅(높이 0.2m) 닿으면 멈추고 고정
          if (this.rocketBody.position.y <= 1.3 && landed && launched && isMaxheight) {
            landTime = performance.now();
  
            this.rocketBody.velocity.set(0, 0, 0);
            this.rocketBody.angularVelocity.set(0, 0, 0);
            this.rocketBody.position.y = 1.6; // 착륙 고정 높이 0.2m
            // console.log("finished")
            this.rocketBody.type = CANNON.Body.KINEMATIC;
            this.rocketBody.updateMassProperties();
  
            // 최초 착륙 위치 기준으로 거리 계산
            const dist = this.firstTouchPosition
              ? Math.sqrt(this.firstTouchPosition.x*this.firstTouchPosition.x + this.firstTouchPosition.z*this.firstTouchPosition.z)
              : 0;
            this.rangeSpan.textContent = dist.toFixed(2);
            return;
          }
          // - 
        } else {
          // 착륙 후 1초 지난 뒤 원점으로 복귀 시작
          const now = performance.now();
          if (now - this.landTime > 500) {
            this.rocketMesh.position.lerp(this.originPosition, 0.1);
            this.rocketBody.position.copy(this.rocketMesh.position);
  
            // 카메라도 원점 뒤쪽 위 위치로 부드럽게 이동
            const desiredCamPos = new Vector3(
              this.rocketMesh.position.x + 10,
              this.rocketMesh.position.y + 5,
              this.rocketMesh.position.z + 10
            );
            camera.position.lerp(desiredCamPos, 0.05);
            camera.lookAt(this.rocketMesh.position);
  
            this.setRocketInitialDirection();
  
            if (this.rocketMesh.position.distanceTo(this.originPosition) < 0.1) {
              this.rocketBody.type = CANNON.Body.DYNAMIC;
              this.rocketBody.mass = this.mass;
              this.rocketBody.updateMassProperties();
  
              this.launched = false;
              this.landed = true;
              this.isMaxheight = false;
              this.firstTouchPosition = null;
              this.touchedGround = false;
            }
          } else {
            // 착륙 후 1초 대기하는 동안 카메라 로켓 따라가게 유지
            const desiredCamPos = new Vector3(
              this.rocketBody.position.x + 10,
              this.rocketBody.position.y + 5,
              this.rocketBody.position.z + 10
            );
            camera.position.lerp(desiredCamPos, 0.05);
            camera.lookAt(this.rocketMesh.position);
          }
        }
      } else {
        // 발사 전 고정 카메라 위치
        camera.position.set(0, 20, 40);
        camera.lookAt(new Vector3(0, 0, 0));
      }
  
      renderer.render(scene, camera);
    };
    
    applyForces() {
      if (!this.rocketBody) return;
    
      const windSpeed = parseFloat(this.windSpeed);
      const windDirDeg = parseFloat(this.windDir);
      if (isNaN(windSpeed) || isNaN(windDirDeg)) return;
  
      const windDirRad = (windDirDeg + 90) * Math.PI / 180; // 반대 방향으로 적용
      const windVec = new CANNON.Vec3(
        windSpeed * Math.cos(windDirRad),
        0,
        windSpeed * Math.sin(windDirRad)
      );
  
      const relVel = this.rocketBody.velocity.vsub(windVec);
      const relSpeed = relVel.length();
      if (relSpeed === 0) return;
  
      const dragMag = 0.5 * this.Cd * this.rho * this.area * relSpeed * relSpeed;
      const drag = relVel.scale(-dragMag / relSpeed);
  
      const forcePos = new CANNON.Vec3(0, 0.6, 0);
      this.rocketBody.applyForce(drag, this.rocketBody.position.vadd(forcePos));
    }
  
    updateRocketRotation() {
      if (!this.rocketBody) return;
  
      if (!this.landed) {
        const velocity = this.rocketBody.velocity;
        if (velocity.lengthSquared() < 0.0001) return;
  
        const dir = new Vector3(velocity.x, velocity.y, velocity.z).normalize();
        const fromDir = new Vector3(0, 1, 0);
        const targetQuat = new Quaternion().setFromUnitVectors(fromDir, dir);
  
        this.rocketMesh.quaternion.slerp(targetQuat, 0.1);
      }
      
    }
    setMarker() {
      const markerGeometry = new THREE.SphereGeometry(0.1, 16);
      const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const arr = [];
      const line = setInterval(() => {
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        if (!this.landed){
          marker.position.set(this.rocketBody.position.x, this.rocketBody.position.y, this.rocketBody.position.z);
          scene.add(marker);
  
          arr.push(marker);
        };
        if (this.landed) {
          // scene.remove(marker);
          // for(let i = 0; i < arr.length; i++){
          //   scene.remove(arr[i]);
          // }
  
          this.li.push(arr);
          // console.log(1)
          clearInterval(line);  
        };
      }, 10);
    };
  };


  launchBtn1.addEventListener('click', () => {
    const rocket1 = new rocket(
      document.getElementById('speed1'),
      document.getElementById('angleXY1'),
      document.getElementById('angleZ1'),
      document.getElementById('launchBtn1'),
      document.getElementById('clearBtn1'),
      document.getElementById('maxHeight1'),
      document.getElementById('range1'),
      document.getElementById('windDir1'),
      document.getElementById('windSpeed1'),
      'red', 'orange'
    );
    rocket1.createRocket();
    rocket1.setMarker();
  });

  launchBtn2.addEventListener('click', () => {
    const rocket2 = new rocket(
      document.getElementById('speed2'),
      document.getElementById('angleXY2'),
      document.getElementById('angleZ2'),
      document.getElementById('launchBtn2'),
      document.getElementById('clearBtn2'),
      document.getElementById('maxHeight2'),
      document.getElementById('range2'),
      document.getElementById('windDir2'),
      document.getElementById('windSpeed2'),
      'blue', 'skyblue'
    );
    rocket2.animate();
    rocket2.createRocket();
    rocket2.setMarker();
  });

  // clearBtn1.addEventListener('click', () => {
  //   for(let i = 0; i < li.length; i++){
  //     for(let j = 0; j < li[i].length; j++){
  //       scene.remove(li[i][j]);
  //     }
  //   }
  // });
  const angleXYInput1 = document.getElementById('angleXY1');
  const angleXYInput2 = document.getElementById('angleXY2');
  const angleZInput1 = document.getElementById('angleZ1');
  const angleZInput2 = document.getElementById('angleZ2');
  const windDirInput1 = document.getElementById('windDir1');
  const windDirInput2 = document.getElementById('windDir2');
  const windSpeedInput1 = document.getElementById('windSpeed1');
  const windSpeedInput2 = document.getElementById('windSpeed2');
  angleXYInput1.addEventListener('input', () => {
    if (!launched) rocket1.setRocketInitialDirection();
  });
  angleXYInput2.addEventListener('input', () => {
    if (!launched) rocket2.setRocketInitialDirection();
  });
  
  angleZInput1.addEventListener('input', () => {
    if (!launched) rocket1.setRocketInitialDirection();
  });
  angleZInput2.addEventListener('input', () => {
    if (!launched) rocket2.setRocketInitialDirection();
  });

  

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  document.querySelectorAll('#windButtons1 button').forEach(btn => {
    btn.addEventListener('click', () => {
      windDirInput1.value = btn.dataset.angle;
      windSpeedInput1.value = 5;
    });
  });
  document.querySelectorAll('#windButtons2 button').forEach(btn => {
    btn.addEventListener('click', () => {
      windDirInput2.value = btn.dataset.angle;
      windSpeedInput2.value = 5;
    });
  });
})();