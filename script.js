(() => {
  const OPENCAGE_API_KEY = '2bd1923c563e46e8a2ed899b7fd3f128';       // ← OpenCage API 키
  const OPENWEATHER_API_KEY = '5f368635c5c63428bd32ef71baf00025'; // ← OpenWeather API 키

  const {
    Scene, PerspectiveCamera, WebGLRenderer, Color, AmbientLight, DirectionalLight,
    Mesh, MeshPhongMaterial, CylinderGeometry, ConeGeometry, PlaneGeometry, AxesHelper,
    Group, BufferGeometry, Float32BufferAttribute, LineBasicMaterial, Line,
    Vector3, Quaternion, Sprite, SpriteMaterial, CanvasTexture
  } = THREE;

  const world = new CANNON.World();
  world.gravity.set(0, -9.8, 0);
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 10;

  const scene = new Scene();
  scene.background = new Color(0xeef7ff);

  const camera = new PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.set(0, 10, 40);
  camera.lookAt(0,0,0)

  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  scene.add(new AmbientLight(0xffffff, 0.6));
  const directional = new DirectionalLight(0xffffff, 0.8);
  directional.position.set(20, 40, 20);
  scene.add(directional);
  scene.add(new AxesHelper(5));

  const floorGeo = new PlaneGeometry(400, 400);
  const floorMat = new MeshPhongMaterial({color: '#6c8'});
  const floorMesh = new Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI/2;
  floorMesh.position.y = 0;
  scene.add(floorMesh);

  const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  groundBody.quaternion.setFromEuler(-Math.PI/2, 0, 0);
  world.addBody(groundBody);

  const rockets = [];
  const li1 = []
  const li2 = []

  class Rocket {
    constructor(options) {
      this.speed = options.speed;
      this.angleXY = options.angleXY;
      this.angleZ = options.angleZ;
      this.windSpeed = options.windSpeed;
      this.windDir = options.windDir;
      this.bodyColor = options.bodyColor;
      this.coneColor = options.coneColor;
      this.maxHeightSpan = options.maxHeightSpan;
      this.rangeSpan = options.rangeSpan;
      this.r1 = options.r1
      this.r2 = options.r2

      this.mass = 0.1;
      this.Cd = 0.75;
      this.rho = 1.225;
      this.area = 0.01;
      this.isMaxheight = false;

      this.rocketBody = null;
      this.rocketMesh = null;
      this.maxHeight = 0;
      this.originPosition = new Vector3(0, 0.25, 0);

    }

    createRocket() {
      this.rocketBody = new CANNON.Body({ mass: this.mass });
      const cylinderShape = new CANNON.Cylinder(0.15, 0.15, 1, 16);
      const quat = new CANNON.Quaternion();
      quat.setFromEuler(Math.PI/2, 0, 0);
      this.rocketBody.addShape(cylinderShape, new CANNON.Vec3(0, 0.5, 0), quat);
      const coneShape = new CANNON.Sphere(0.15);
      this.rocketBody.addShape(coneShape, new CANNON.Vec3(0, 1.2, 0));
      this.rocketBody.position.copy(this.originPosition);
      world.add(this.rocketBody)

      this.rocketMesh = new Group();
      const bodyMesh = new Mesh(new CylinderGeometry(0.15, 0.15, 1, 16), new MeshPhongMaterial({ color: this.bodyColor }));
      bodyMesh.position.y = 0.5;
      this.rocketMesh.add(bodyMesh);

      const coneMesh = new Mesh(new ConeGeometry(0.15, 0.4, 16), new MeshPhongMaterial({ color: this.coneColor }));
      coneMesh.position.y = 1.2;
      this.rocketMesh.add(coneMesh);

      scene.add(this.rocketMesh);

      this.setInitialVelocity();
    }

    setInitialVelocity() {
      const speed = parseFloat(this.speed);
      const angleXY = parseFloat(this.angleXY) * Math.PI/180;
      const angleZ = parseFloat(this.angleZ) * Math.PI/180;

      const vx = speed * Math.cos(angleXY) * Math.cos(angleZ);
      const vy = speed * Math.sin(angleXY);
      const vz = speed * Math.cos(angleXY) * Math.sin(angleZ);

      this.rocketBody.velocity.set(vx, vy, vz);

      const fromDir = new Vector3(0, 1, 0);
      const targetDir = new Vector3(vx, vy, vz).normalize();
      this.rocketMesh.quaternion.copy(new Quaternion().setFromUnitVectors(fromDir, targetDir));
    }

    applyForces() {
      const windSpeed = parseFloat(this.windSpeed);
      const windDirDeg = parseFloat(this.windDir);
      const windDirRad = (windDirDeg + 90) * Math.PI / 180;
      const windVec = new CANNON.Vec3(
        windSpeed * Math.cos(windDirRad),
        0,
        windSpeed * Math.sin(windDirRad)
      );
      const relVel = this.rocketBody.velocity.vsub(windVec);
      const relSpeed = relVel.length();
      const dragMag = 0.5 * this.Cd * this.rho * this.area * relSpeed * relSpeed;
      const drag = relVel.scale(-dragMag / relSpeed);
      this.rocketBody.applyForce(drag, this.rocketBody.position.vadd(new CANNON.Vec3(0,0.6,0)));
    }

    updateMesh() {
      this.rocketMesh.position.copy(this.rocketBody.position);

      const velocity = this.rocketBody.velocity;
      if (velocity.lengthSquared() > 0.0001) {
        const dir = new Vector3(velocity.x, velocity.y, velocity.z).normalize();
        this.rocketMesh.quaternion.slerp(new Quaternion().setFromUnitVectors(new Vector3(0,1,0), dir), 0.1);
      }

      // 최고 높이 갱신
      if (!this.maxHeight) this.maxHeight = 0;
      if (this.rocketBody.position.y > this.maxHeight) {
        this.maxHeight = this.rocketBody.position.y;
        if(this.maxHeightSpan){
          this.maxHeightSpan.textContent = this.maxHeight.toFixed(2);
        } 
      }
      else this.isMaxheight = true;

      // 착륙 감지
      if (this.rocketBody.position.y <= 1.4 && this.isMaxheight) {
        if (this.rocketMesh.parent) scene.remove(this.rocketMesh);
        if (world.bodies.includes(this.rocketBody)) world.removeBody(this.rocketBody);
        if(this.rangeSpan){
          const dist = Math.sqrt(this.rocketBody.position.x**2 + this.rocketBody.position.z**2);
          this.rangeSpan.textContent = dist.toFixed(2);
        }
        const index = rockets.indexOf(this);
        if(index > -1) rockets.splice(index,1);

        const markerGeometry = new THREE.SphereGeometry(0.2, 32); // 반지름 0.2, 세그먼트 32
        const markerMaterial = new THREE.MeshBasicMaterial({ color: this.bodyColor}); // 빨간색
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.set(this.rocketBody.position.x, 0.2, this.rocketBody.position.z); // 원하는 위치로 설정
        scene.add(marker);
        launchBtn1.disabled = false;
        launchBtn2.disabled = false;
      }

      if(this.r1){
        camera.position.set(this.rocketBody.position.x, this.rocketBody.position.y + 5, this.rocketBody.position.z + 20)
        camera.lookAt(this.rocketBody.position.x, this.rocketBody.position.y, this.rocketBody.position.z);
        if(this.rocketBody.position.y <= 1.4 && this.isMaxheight){
          camera.position.set(0, 10, 40);
          camera.lookAt(this.originPosition)
        }
      }

      if(this.r2){
        camera.position.set(this.rocketBody.position.x, this.rocketBody.position.y + 5, this.rocketBody.position.z + 20)
        camera.lookAt(this.rocketBody.position.x, this.rocketBody.position.y, this.rocketBody.position.z);
        if(this.rocketBody.position.y <= 1.4 && this.isMaxheight){
          camera.position.set(0, 10, 40);
          camera.lookAt(this.originPosition);
        }
      }
    }
    setMarker() {
      const markerGeometry = new THREE.SphereGeometry(0.15, 16);
      const markerMaterial = new THREE.MeshBasicMaterial({ color: this.bodyColor});
      const arr = [];
      const line = setInterval(() => {
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        if (!this.rocketBody.position.y <= 1.4){
          marker.position.set(this.rocketBody.position.x, this.rocketBody.position.y, this.rocketBody.position.z);
          scene.add(marker);
          arr.push(marker);
        };
        if(this.rocketBody.position.y <= 1.4 && this.isMaxheight){
          clearInterval(line);  
          if(this.r1) li1.push(arr);
          if(this.r2) li2.push(arr);
        };
      }, 10);
    }
  }

  const launchBtn1 = document.getElementById('launchBtn1');
  const launchBtn2 = document.getElementById('launchBtn2');

  launchBtn1.addEventListener('click', () => {
    const r1 = new Rocket({
      speed: document.getElementById('speed1').value,
      angleXY: document.getElementById('angleXY1').value,
      angleZ: document.getElementById('angleZ1').value,
      windSpeed: document.getElementById('windSpeed1').value,
      windDir: document.getElementById('windDir1').value,
      bodyColor: 'red',
      coneColor: 'orange',
      maxHeightSpan: document.getElementById('maxHeight1'),
      rangeSpan: document.getElementById('range1'),
      r1 : true,
      r2 : false
    });
    r1.createRocket();
    r1.setMarker()
    rockets.push(r1);
    launchBtn1.disabled = true;
    launchBtn2.disabled = true;
  });

  launchBtn2.addEventListener('click', () => {
    const r2 = new Rocket({
      speed: document.getElementById('speed2').value,
      angleXY: document.getElementById('angleXY2').value,
      angleZ: document.getElementById('angleZ2').value,
      windSpeed: document.getElementById('windSpeed2').value,
      windDir: document.getElementById('windDir2').value,
      bodyColor: 'blue',
      coneColor: 'skyblue',
      maxHeightSpan: document.getElementById('maxHeight2'),
      rangeSpan: document.getElementById('range2'),
      r1: false,
      r2: true
    });
    r2.createRocket();
    r2.setMarker();
    rockets.push(r2);
    launchBtn2.disabled = true;
    launchBtn1.disabled = true;
  });

  function animate() {
    requestAnimationFrame(animate);
    world.step(1/60);

    rockets.forEach(r => {
      r.applyForces();
      r.updateMesh();
    });

    renderer.render(scene, camera);
  }
  animate();

  const windDirInput1 = document.getElementById('windDir1');
  const windDirInput2 = document.getElementById('windDir2');
  const windSpeedInput1 = document.getElementById('windSpeed1');
  const windSpeedInput2 = document.getElementById('windSpeed2');
  const clearBtn1 = document.getElementById('clearBtn1');
  const clearBtn2 = document.getElementById('clearBtn2');
  const myLocation1 = document.getElementById('myLocation1');
  const myLocation2 = document.getElementById('myLocation2');

  myLocation1.addEventListener('click', () =>{
    if (!navigator.geolocation) {
      alert("이 브라우저는 위치 정보를 지원하지 않습니다.");
      return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=kr`;
      const addressUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;

      try {
        const [weatherRes, addressRes] = await Promise.all([
          fetch(weatherUrl),
          fetch(addressUrl)
        ]);

          const weatherData = await weatherRes.json();
          const windspd = weatherData.wind.speed;
          const winddeg = weatherData.wind.deg;

          windDirInput1.value = winddeg;
          windSpeedInput1.value = windspd;
      } catch (err) {
        console.error(err);
        alert("날씨 정보를 가져오는 데 실패했습니다.");
      }
    }, () => {
      alert("위치 정보를 가져올 수 없습니다.");
    });
  }
  ) 
  myLocation2.addEventListener('click', () =>{
    if (!navigator.geolocation) {
      alert("이 브라우저는 위치 정보를 지원하지 않습니다.");
      return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=kr`;
      const addressUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;

      try {
        const [weatherRes, addressRes] = await Promise.all([
          fetch(weatherUrl),
          fetch(addressUrl)
        ]);

          const weatherData = await weatherRes.json();
          const windspd = weatherData.wind.speed;
          const winddeg = weatherData.wind.deg;

          windDirInput2.value = winddeg;
          windSpeedInput2.value = windspd;
      } catch (err) {
        console.error(err);
        alert("날씨 정보를 가져오는 데 실패했습니다.");
      }
    }, () => {
      alert("위치 정보를 가져올 수 없습니다.");
    });
  }
  ) 
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

  clearBtn1.addEventListener('click', () => {
    for(let i=0;i<li1.length;i++){
      for(let j=0;j<li1[i].length;j++){
        scene.remove(li1[i][j]);
      }
    }
  });

  clearBtn2.addEventListener('click', () => {
    for(let i=0; i<li2.length;i++){
      for(let j=0; j<li2[i].length;j++){
        scene.remove(li2[i][j]);
      }
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
})();