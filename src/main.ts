import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as dat from 'dat.gui';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class FluffyGrass {
  // # Need access to these outside the comp
  private loadingManager: THREE.LoadingManager;
  private textureLoader: THREE.TextureLoader;
  private gltfLoader: GLTFLoader;

  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private canvas: HTMLCanvasElement;
  private stats: Stats;
  private orbitControls: OrbitControls;
  private gui: dat.GUI;
  private sceneGUI: dat.GUI;
  private sceneProps = {
    fogColor: '#f3e9ff',
    terrainColor: '#79e7ff',
    fogDensity: 0.01,
  };
  private textures: { [key: string]: THREE.Texture; } = {};

  Uniforms = {
    uTime: { value: 0 },
    color: { value: new THREE.Color(this.sceneProps.terrainColor) },
  };
  private clock = new THREE.Clock();



  constructor(_canvas: HTMLCanvasElement) {
    this.loadingManager = new THREE.LoadingManager();
    this.textureLoader = new THREE.TextureLoader(this.loadingManager);

    this.gui = new dat.GUI();
    this.setupGUI();
    this.sceneGUI = this.gui.addFolder('Scene Properties');
    this.sceneGUI.open();

    this.gltfLoader = new GLTFLoader(this.loadingManager);

    this.canvas = _canvas;
    // this.canvas.style.pointerEvents = 'all';
    this.stats = new Stats();

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(20, 20, 20);
    this.scene = new THREE.Scene();

    this.scene.background = new THREE.Color(this.sceneProps.fogColor);
    this.scene.fog = new THREE.FogExp2(
      this.sceneProps.fogColor,
      this.sceneProps.fogDensity,
    );

    this.sceneGUI
      .add(this.sceneProps, 'fogDensity', 0, 0.01, 0.000001)
      .onChange((value) => {
        (this.scene.fog as THREE.FogExp2).density = value;
      });
    this.sceneGUI.addColor(this.sceneProps, 'fogColor').onChange((value) => {
      this.scene.fog?.color.set(value);
      this.scene.background = new THREE.Color(value);
    });

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      precision: 'highp', // Use high precision
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.frustumCulled = true;

    this.orbitControls = new OrbitControls(this.camera, canvas);
    // this.orbitControls.enableDamping = true;
    // this.orbitControls.dampingFactor = 0.05;

    this.init();
  }

  private init() {
    this.setupStats();
    this.setupTextures();
    this.loadModels();
    this.setupEventListeners();
    this.addLights();
    // this.addObjects();
  }

  private addObjects() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshMatcapMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);
    this.scene.add(cube);
  }
  private addLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.);
    directionalLight.position.set(100, 100, 100);
    this.scene.add(directionalLight);
  }

  private addGrass() {
    
  }

  private loadModels() {
    const terrainMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      uniforms: {
        uTime: this.Uniforms.uTime,
        uNoiseTexture: { value: this.textures.perlinNoise },
        uColor: this.Uniforms.color,
      },
      vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying float vIndex;

      uniform float uTime;
      uniform sampler2D uNoiseTexture;
      uniform vec3 uColor;
      void main() {
        vUv = uv;
        vNormal = normal;
        vec3 pos = position;
        float noise = texture2D(uNoiseTexture, vUv).r;
        pos.z += noise * 0.5;
        vIndex = float(gl_InstanceID);
        vec4 modelPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec4 viewPosition = viewMatrix * modelPosition;
        gl_Position = projectionMatrix * viewPosition;
        vPosition = modelPosition.xyz;
      }
      `,
      fragmentShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      uniform float uTime;
      varying float vIndex;

      uniform sampler2D uNoiseTexture;
      uniform vec3 uColor;
      // 2d hash function
      const uint k = 1103515245U;  // GLIB C
      //const uint k = 134775813U;   // Delphi and Turbo Pascal
      //const uint k = 20170906U;    // Today's date (use three days ago's dateif you want a prime)
      //const uint k = 1664525U;     // Numerical Recipes
      
      float hash3( uvec3 st )
      {
          st = ((st>>8U)^st.yzx)*k;
          st = ((st>>8U)^st.yzx)*k;
          st = ((st>>8U)^st.yzx)*k;
          
          return float(st.x+st.y+st.z)*(1.0/float(0xffffffffU));
      }

      float hash2( uvec2 st )
      {
          st = ((st>>8U)^st.yx)*k;
          st = ((st>>8U)^st.yx)*k;
          // st = ((st>>8U)^st.yx)*k;
          return float(st.x+st.y)*(1.0/float(0xffffffffU));
      }

      float rand(float n){return fract(sin(n) * 43758.5453123);}

      void main() {
        vec3 color = uColor;
        float density = 50.;
        vec2 uv = vUv*density;
        vec2 visualizeUV = fract(uv)*2.-1.;

        float hashValue = hash3(uvec3(uv,1.));
        float height = vPosition.y * 0.4;
        float stepHash = step(height,hashValue);

        color = color * height;

        float grassHeight = hashValue;
        float distance = length(visualizeUV);
        float circle = step(distance, 1.5-height);
        float h = vIndex / 50.;

				bool outsideThickness = (distance) > (1. * (grassHeight - h));

        if (outsideThickness && vIndex>0.) discard;

        float alpha = stepHash *circle ;

        gl_FragColor = vec4(color, alpha);

        // gl_FragColor = vec4(circle);
      }
      `,
    });

    this.sceneGUI.addColor(this.sceneProps, 'terrainColor').onChange((value:THREE.ColorRepresentation) => {
      this.Uniforms.color.value.set(value);
    });

    // add a plane to the scene
    const planeGeometry = new THREE.PlaneGeometry(20, 20);
    // const plane = new THREE.Mesh(planeGeometry, terrainMat);
    planeGeometry.rotateX(-Math.PI / 2);

    const numberOfInstances = 50;
    const offset = 0.05;
		const grassMesh = new THREE.InstancedMesh(planeGeometry, terrainMat, numberOfInstances);
		// grassMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // For better performance

		for (let i = 0; i < numberOfInstances; i++) {
			grassMesh.setMatrixAt(
				i,
				new THREE.Matrix4().makeTranslation(0, offset * i, 0),
			);
		}
		grassMesh.instanceMatrix.needsUpdate = true;

    this.scene.add(grassMesh);


    // plane.receiveShadow = true;
    // this.scene.add(plane);


    // this.gltfLoader.load(
    //   '/terrain.glb',
    //   (gltf) => {
    //     gltf.scene.traverse((child) => {
    //       if (child instanceof THREE.Mesh) {
    //         child.material = terrainMat;
    //       }
    //     });

    //     this.scene.add(gltf.scene);
    //   },
    //   undefined,
    //   (error: any) => {
    //     console.error(error);
    //   },
    // );
  }

  public render() {
    this.Uniforms.uTime.value += this.clock.getDelta();
    this.renderer.render(this.scene, this.camera);
    // this.postProcessingManager.update();
    this.stats.update();
    this.orbitControls.update();
    requestAnimationFrame(() => this.render());
  }

  private setupTextures() {
    this.textures.perlinNoise = this.textureLoader.load(
      '/textures/noise/perlinnoise.webp',
    );

    this.textures.perlinNoise.wrapS = this.textures.perlinNoise.wrapT = THREE.RepeatWrapping;
  }

  private setupGUI() {
    this.gui.close();
    const guiContainer = this.gui.domElement.parentElement as HTMLDivElement;
    guiContainer.style.zIndex = '9999';
    guiContainer.style.position = 'fixed';
    guiContainer.style.top = '0';
    guiContainer.style.left = '0';
    guiContainer.style.right = 'auto';
    guiContainer.style.display = 'block';
  }

  private setupStats() {
    this.stats.dom.style.bottom = '0';
    this.stats.dom.style.top = 'auto';
    this.stats.dom.style.left = 'auto';
    this.stats.dom.style.right = '0';
    this.stats.dom.style.display = 'block';
    document.body.appendChild(this.stats.dom);
  }

  private setupEventListeners() {
    window.addEventListener('resize', () => this.setAspectResolution(), false);

    this.stats.dom.addEventListener('click', () => {
      console.log(this.renderer.info.render);
    });
  }

  private setAspectResolution() {

    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // this.postProcessingManager.composer.setSize(
    // 	window.innerWidth,
    // 	window.innerHeight,
    // );
  }
}

const canvas = document.querySelector('#canvas') as HTMLCanvasElement;
const app = new FluffyGrass(canvas);
app.render();