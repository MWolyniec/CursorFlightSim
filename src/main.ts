import * as THREE from 'three';

class FlightSimulator {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private airplane!: THREE.Group;
    private terrain!: THREE.Mesh;
    private mouseSensitivity = 0.005;
    private baseSpeed = 2;
    private speed = this.baseSpeed;
    private pitch = 0;
    private yaw = 0;
    private isPointerLocked = false;
    private clouds: THREE.Mesh[] = [];
    private cats: THREE.Group[] = [];
    private bullets: THREE.Mesh[] = [];
    private afterburner!: THREE.PointLight;
    private afterburnerMesh!: THREE.Mesh;
    private isBoostActive = false;
    private lastShotTime = 0;
    private readonly SHOT_COOLDOWN = 100; // ms między strzałami
    private score = 0;
    private scoreDisplay: HTMLDivElement;
    private lastScoreUpdate = Date.now();
    private isGameOver = false;
    private gameOverScreen: HTMLDivElement | null = null;
    private explosions: THREE.Points[] = [];
    private isGameWon = false;
    private difficultyScreen: HTMLDivElement;
    private isGameStarted = false;
    private isHardMode = false;
    private bigCat: THREE.Group | null = null;
    private frustum: THREE.Frustum;
    private cameraViewMatrix: THREE.Matrix4;
    private objectsToUpdate: THREE.Object3D[] = [];
    private static readonly VIEW_DISTANCE = 30000;
    private static readonly CULLING_INTERVAL = 1000; // ms
    private lastCullingTime = 0;

    constructor() {
        console.log('Inicjalizacja symulatora...');
        
        // Inicjalizacja sceny
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);

        // Kamera
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            100000
        );
        this.camera.position.set(0, 1000, 1000);
        this.camera.lookAt(0, 0, 0);

        // Renderer z włączonym cieniowaniem
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);

        // Tworzenie wyświetlacza punktów
        this.scoreDisplay = document.createElement('div');
        this.scoreDisplay.style.position = 'fixed';
        this.scoreDisplay.style.top = '20px';
        this.scoreDisplay.style.left = '20px';
        this.scoreDisplay.style.color = 'white';
        this.scoreDisplay.style.fontSize = '24px';
        this.scoreDisplay.style.fontFamily = 'Arial, sans-serif';
        this.scoreDisplay.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
        this.scoreDisplay.style.display = 'none'; // Ukrywamy na początku
        document.body.appendChild(this.scoreDisplay);

        // Tworzenie ekranu wyboru trudności
        this.difficultyScreen = document.createElement('div');
        this.difficultyScreen.style.position = 'fixed';
        this.difficultyScreen.style.top = '50%';
        this.difficultyScreen.style.left = '50%';
        this.difficultyScreen.style.transform = 'translate(-50%, -50%)';
        this.difficultyScreen.style.background = 'rgba(0, 0, 0, 0.8)';
        this.difficultyScreen.style.color = 'white';
        this.difficultyScreen.style.padding = '20px';
        this.difficultyScreen.style.borderRadius = '10px';
        this.difficultyScreen.style.textAlign = 'center';
        this.difficultyScreen.innerHTML = `
            <h1 style="margin-bottom: 20px;">Wybierz poziom trudności</h1>
            <button id="easyMode" style="padding: 10px 20px; font-size: 18px; margin: 10px; cursor: pointer; background: #4CAF50; color: white; border: none; border-radius: 5px;">
                Łatwy
                <br>
                <small style="font-size: 14px;">(z dodatkowym dużym kotem)</small>
            </button>
            <button id="hardMode" style="padding: 10px 20px; font-size: 18px; margin: 10px; cursor: pointer; background: #f44336; color: white; border: none; border-radius: 5px;">
                Trudny
                <br>
                <small style="font-size: 14px;">(bez dodatkowego kota)</small>
            </button>
        `;
        document.body.appendChild(this.difficultyScreen);

        // Dodawanie obsługi przycisków
        const easyButton = this.difficultyScreen.querySelector('#easyMode');
        const hardButton = this.difficultyScreen.querySelector('#hardMode');
        
        if (easyButton) {
            easyButton.addEventListener('click', () => this.startGame(false));
        }
        if (hardButton) {
            hardButton.addEventListener('click', () => this.startGame(true));
        }

        // Obsługa zdarzeń
        window.addEventListener('resize', this.onWindowResize.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.renderer.domElement.addEventListener('click', this.requestPointerLock.bind(this));
        document.addEventListener('pointerlockchange', this.onPointerLockChange.bind(this));

        // Start animacji
        this.animate();
        console.log('Inicjalizacja zakończona!');

        this.frustum = new THREE.Frustum();
        this.cameraViewMatrix = new THREE.Matrix4();
        
        // Optymalizacja renderera
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }

    private startGame(isHard: boolean): void {
        this.isHardMode = isHard;
        this.isGameStarted = true;
        this.difficultyScreen.style.display = 'none';
        this.scoreDisplay.style.display = 'block';

        // Inicjalizacja świateł i terenu
        this.setupLights();
        this.createTerrain();
        this.createMountains();
        this.createBuildings();
        this.createLakes();
        this.createClouds();
        this.createFlyingCats();
        this.createAirplane();

        // Reset stanu gry
        this.score = 0;
        this.updateScoreDisplay();
    }

    private setupLights(): void {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
        directionalLight.position.set(5000, 8000, 0);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 4096;
        directionalLight.shadow.mapSize.height = 4096;
        directionalLight.shadow.camera.near = 100;
        directionalLight.shadow.camera.far = 30000;
        directionalLight.shadow.camera.left = -15000;
        directionalLight.shadow.camera.right = 15000;
        directionalLight.shadow.camera.top = 15000;
        directionalLight.shadow.camera.bottom = -15000;
        directionalLight.shadow.bias = -0.0001;
        this.scene.add(directionalLight);

        const sunGeometry = new THREE.SphereGeometry(500, 32, 32);
        const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const sun = new THREE.Mesh(sunGeometry, sunMaterial);
        sun.position.copy(directionalLight.position);
        this.scene.add(sun);
    }

    private createTerrain(): void {
        const size = 40000;
        // Zmniejszamy ilość segmentów dla lepszej wydajności
        const segments = 200;
        const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
        
        const material = new THREE.MeshPhongMaterial({ 
            color: 0x3d8c40,
            side: THREE.FrontSide, // Zmiana z DoubleSide na FrontSide
            shininess: 0
        });

        this.terrain = new THREE.Mesh(geometry, material);
        this.terrain.rotation.x = -Math.PI / 2;
        this.terrain.position.y = 0;
        this.terrain.receiveShadow = true;
        
        this.scene.add(this.terrain);
        this.createGroundTrees();
    }

    private createGroundTrees(): void {
        const terrainSize = 20000;
        const treeCount = 1000; // Zmniejszona liczba drzew
        const minDistanceFromWater = 50;
        const treeGeometries = this.createTreeTemplates();

        for (let i = 0; i < treeCount; i++) {
            const x = (Math.random() - 0.5) * terrainSize;
            const z = (Math.random() - 0.5) * terrainSize;

            if (!this.isNearWater(x, z, minDistanceFromWater) && !this.isNearBuilding(x, z)) {
                const templateIndex = Math.floor(Math.random() * treeGeometries.length);
                const tree = treeGeometries[templateIndex].clone();
                tree.position.set(x, 0, z);
                this.scene.add(tree);
                this.objectsToUpdate.push(tree);
            }
        }
    }

    private createTreeTemplates(): THREE.Group[] {
        const templates: THREE.Group[] = [];
        const variations = 3;

        for (let i = 0; i < variations; i++) {
            const height = 30 + Math.random() * 50;
            const template = new THREE.Group();

            const trunkGeometry = new THREE.CylinderGeometry(2, 4, height, 6);
            const trunkMaterial = new THREE.MeshPhongMaterial({ color: 0x4d2926 });
            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);

            const crownGeometry = new THREE.ConeGeometry(20, height, 8);
            const crownMaterial = new THREE.MeshPhongMaterial({ color: 0x0b5c0b });
            const crown = new THREE.Mesh(crownGeometry, crownMaterial);
            crown.position.y = height * 0.7;

            template.add(trunk);
            template.add(crown);
            template.castShadow = true;
            template.receiveShadow = true;

            templates.push(template);
        }

        return templates;
    }

    private isNearWater(x: number, z: number, minDistance: number): boolean {
        // Sprawdzanie odległości od wszystkich jezior
        for (const lake of this.scene.children) {
            if (lake instanceof THREE.Mesh && lake.userData.isLake) {
                const dx = lake.position.x - x;
                const dz = lake.position.z - z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                if (distance < lake.userData.radius + minDistance) {
                    return true;
                }
            }
        }
        return false;
    }

    private isNearBuilding(x: number, z: number): boolean {
        const minDistance = 30;
        for (const building of this.scene.children) {
            if (building instanceof THREE.Mesh && building.userData.isBuilding) {
                const dx = building.position.x - x;
                const dz = building.position.z - z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                if (distance < minDistance) {
                    return true;
                }
            }
        }
        return false;
    }

    private createMountains(): void {
        const mountainCount = 20;
        const terrainSize = 20000;
        const mountainSize = 5000;

        for (let i = 0; i < mountainCount; i++) {
            const mountainGeometry = new THREE.ConeGeometry(
                1000 + Math.random() * 1000, // promień podstawy
                2000 + Math.random() * 3000, // wysokość
                8 + Math.floor(Math.random() * 6) // liczba segmentów
            );
            
            const mountainMaterial = new THREE.MeshPhongMaterial({
                color: 0x808080,
                shininess: 0
            });

            const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
            
            // Pozycja w dalszej części terenu
            const angle = (Math.PI * 2 * i) / mountainCount;
            const radius = terrainSize * 0.7;
            mountain.position.x = Math.cos(angle) * radius;
            mountain.position.z = Math.sin(angle) * radius;
            mountain.position.y = mountain.geometry.parameters.height / 2;

            mountain.castShadow = true;
            mountain.receiveShadow = true;

            this.scene.add(mountain);

            // Dodawanie drzew na zboczach góry
            this.addTreesToMountain(mountain);
        }
    }

    private addTreesToMountain(mountain: THREE.Mesh): void {
        const treeCount = 100;
        const mountainGeometry = mountain.geometry as THREE.ConeGeometry;
        const mountainHeight = mountainGeometry.parameters?.height || 2000;
        const mountainRadius = mountainGeometry.parameters?.radius || 1000;

        for (let i = 0; i < treeCount; i++) {
            const treeHeight = 50 + Math.random() * 100;
            
            // Tworzenie pnia
            const trunkGeometry = new THREE.CylinderGeometry(2, 4, treeHeight, 6);
            const trunkMaterial = new THREE.MeshPhongMaterial({ color: 0x4d2926 });
            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);

            // Tworzenie korony
            const crownGeometry = new THREE.ConeGeometry(20, treeHeight, 8);
            const crownMaterial = new THREE.MeshPhongMaterial({ color: 0x0b5c0b });
            const crown = new THREE.Mesh(crownGeometry, crownMaterial);
            crown.position.y = treeHeight * 0.7;

            // Grupowanie części drzewa
            const tree = new THREE.Group();
            tree.add(trunk);
            tree.add(crown);

            // Losowa pozycja na zboczu góry
            const angle = Math.random() * Math.PI * 2;
            const heightFactor = Math.random() * 0.7; // Wysokość na zboczu
            const radius = mountainRadius * (1 - heightFactor);

            tree.position.x = Math.cos(angle) * radius;
            tree.position.z = Math.sin(angle) * radius;
            tree.position.y = mountainHeight * heightFactor;

            // Pochylenie drzewa zgodnie ze zboczem
            const slopeAngle = Math.PI * 0.15;
            tree.rotation.x = Math.cos(angle) * slopeAngle;
            tree.rotation.z = Math.sin(angle) * slopeAngle;

            tree.castShadow = true;
            tree.receiveShadow = true;

            // Przesunięcie względem pozycji góry
            tree.position.x += mountain.position.x;
            tree.position.z += mountain.position.z;
            tree.position.y += mountain.position.y - mountainHeight/2;

            this.scene.add(tree);
        }
    }

    private createBuildings(): void {
        const buildingCount = 500;
        const terrainSize = 10000; // Połowa wielkości terenu

        for (let i = 0; i < buildingCount; i++) {
            const width = 50 + Math.random() * 150;
            const height = 100 + Math.random() * 500;
            const depth = 50 + Math.random() * 150;

            const geometry = new THREE.BoxGeometry(width, height, depth);
            const material = new THREE.MeshPhongMaterial({
                color: 0x808080,
                shininess: 10
            });

            const building = new THREE.Mesh(geometry, material);
            
            // Losowa pozycja
            building.position.x = (Math.random() - 0.5) * terrainSize;
            building.position.z = (Math.random() - 0.5) * terrainSize;
            building.position.y = height / 2;

            building.castShadow = true;
            building.receiveShadow = true;

            this.scene.add(building);
        }
    }

    private createLakes(): void {
        const lakeCount = 20;
        const terrainSize = 10000;

        for (let i = 0; i < lakeCount; i++) {
            const radius = 100 + Math.random() * 300;
            const geometry = new THREE.CircleGeometry(radius, 32);
            const material = new THREE.MeshPhongMaterial({
                color: 0x0066cc,
                shininess: 100,
                specular: 0x111111
            });

            const lake = new THREE.Mesh(geometry, material);
            lake.rotation.x = -Math.PI / 2;
            lake.position.x = (Math.random() - 0.5) * terrainSize;
            lake.position.z = (Math.random() - 0.5) * terrainSize;
            lake.position.y = 1;
            lake.receiveShadow = true;
            lake.userData.isLake = true;
            lake.userData.radius = radius;

            this.scene.add(lake);
        }
    }

    private createClouds(): void {
        const cloudCount = 100;
        const terrainSize = 15000;

        for (let i = 0; i < cloudCount; i++) {
            const width = 200 + Math.random() * 400;
            const height = 50 + Math.random() * 100;
            const depth = 200 + Math.random() * 400;

            const geometry = new THREE.SphereGeometry(1, 16, 16);
            const material = new THREE.MeshPhongMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.8,
                shininess: 0
            });

            const cloud = new THREE.Mesh(geometry, material);
            cloud.scale.set(width, height, depth);
            
            cloud.position.x = (Math.random() - 0.5) * terrainSize;
            cloud.position.z = (Math.random() - 0.5) * terrainSize;
            cloud.position.y = 1000 + Math.random() * 2000;

            cloud.castShadow = true;
            this.clouds.push(cloud);
            this.scene.add(cloud);
        }
    }

    private createFlyingCats(): void {
        // Najpierw tworzymy dużego kota (tylko w trybie łatwym)
        if (!this.isHardMode) {
            this.bigCat = this.createCat(3);
            this.bigCat.position.set(0, 500, -1000);
            this.cats.push(this.bigCat);
            this.scene.add(this.bigCat);
        }

        // Zwykłe latające koty
        for (let i = 0; i < 5; i++) {
            const cat = this.createCat(1);
            const angle = (Math.random() * 2 * Math.PI) / 5;
            const radius = 2000;
            cat.position.set(
                Math.cos(angle) * radius,
                1500 + Math.random() * 1000,
                Math.sin(angle) * radius
            );
            this.cats.push(cat);
            this.scene.add(cat);
        }
    }

    private createCat(scale: number = 1): THREE.Group {
        const cat = new THREE.Group();
        cat.name = 'cat'; // Dodajemy nazwę dla identyfikacji

        // Ciało kota
        const bodyGeometry = new THREE.SphereGeometry(30 * scale, 16, 16);
        const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0xff69b4 }); // Różowy
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        cat.add(body);

        // Głowa
        const headGeometry = new THREE.SphereGeometry(20 * scale, 16, 16);
        const head = new THREE.Mesh(headGeometry, bodyMaterial);
        head.position.x = 25 * scale;
        head.position.y = 10 * scale;
        cat.add(head);

        // Uszy
        const earGeometry = new THREE.ConeGeometry(8 * scale, 20 * scale, 3);
        const ear1 = new THREE.Mesh(earGeometry, bodyMaterial);
        const ear2 = new THREE.Mesh(earGeometry, bodyMaterial);
        ear1.position.set(25 * scale, 30 * scale, 8 * scale);
        ear2.position.set(25 * scale, 30 * scale, -8 * scale);
        cat.add(ear1);
        cat.add(ear2);

        // Ogon
        const tailGeometry = new THREE.CylinderGeometry(3 * scale, 3 * scale, 40 * scale, 8);
        const tail = new THREE.Mesh(tailGeometry, bodyMaterial);
        tail.position.x = -25 * scale;
        tail.position.y = 10 * scale;
        tail.rotation.z = Math.PI / 4;
        cat.add(tail);

        return cat;
    }

    private requestPointerLock(): void {
        this.renderer.domElement.requestPointerLock();
    }

    private onPointerLockChange(): void {
        this.isPointerLocked = document.pointerLockElement === this.renderer.domElement;
    }

    private createAirplane(): void {
        this.airplane = new THREE.Group();
        
        // Kadłub - teraz biały
        const fuselageGeometry = new THREE.CylinderGeometry(1, 1, 8, 8);
        const fuselageMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xffffff,
            shininess: 100 // Dodajemy połysk
        });
        const fuselage = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
        fuselage.rotation.z = Math.PI / 2;
        fuselage.castShadow = true;
        this.airplane.add(fuselage);

        // Skrzydła - też białe
        const wingGeometry = new THREE.BoxGeometry(15, 0.5, 3);
        const wingMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xffffff,
            shininess: 100
        });
        const wings = new THREE.Mesh(wingGeometry, wingMaterial);
        wings.castShadow = true;
        this.airplane.add(wings);

        // Statecznik pionowy - też biały
        const tailGeometry = new THREE.BoxGeometry(0.5, 3, 2);
        const tailMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xffffff,
            shininess: 100
        });
        const tail = new THREE.Mesh(tailGeometry, tailMaterial);
        tail.position.set(-3.5, 1.5, 0);
        tail.castShadow = true;
        this.airplane.add(tail);

        // Dopalacz - świecąca kula
        const afterburnerGeometry = new THREE.BoxGeometry(14, 0.2, 0.2);
        const afterburnerMaterial = new THREE.MeshBasicMaterial({
            color: 0xff4400,
            transparent: true,
            opacity: 0
        });
        this.afterburnerMesh = new THREE.Mesh(afterburnerGeometry, afterburnerMaterial);
        this.afterburnerMesh.position.set(0, 0, 1.5);
        this.airplane.add(this.afterburnerMesh);

        // Światło dopalacza - zwiększona intensywność
        this.afterburner = new THREE.PointLight(0xff4400, 0, 500); // Zwiększona maksymalna intensywność
        this.afterburner.position.copy(this.afterburnerMesh.position);
        this.airplane.add(this.afterburner);

        this.scene.add(this.airplane);
        this.airplane.position.set(0, 500, 0);
    }

    private onWindowResize(): void {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    private onMouseMove(event: MouseEvent): void {
        if (!this.isPointerLocked) return;

        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;

        this.yaw -= movementX * this.mouseSensitivity;
        this.pitch -= movementY * this.mouseSensitivity;

        // Ograniczenie przechylenia
        this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));
    }

    private updatePlanePosition(): void {
        // Aktualizacja rotacji samolotu
        this.airplane.rotation.y = this.yaw;
        this.airplane.rotation.x = this.pitch;

        // Ruch do przodu
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(this.airplane.quaternion);
        direction.multiplyScalar(this.speed);
        this.airplane.position.add(direction);

        // Aktualizacja pozycji kamery
        const cameraOffset = new THREE.Vector3(0, 2, 10);
        cameraOffset.applyQuaternion(this.airplane.quaternion);
        this.camera.position.copy(this.airplane.position).add(cameraOffset);
        this.camera.lookAt(this.airplane.position);
    }

    private shoot(): void {
        if (!this.isPointerLocked || this.isGameOver || this.isGameWon) return;
        
        const now = Date.now();
        if (now - this.lastShotTime < this.SHOT_COOLDOWN) return;
        this.lastShotTime = now;

        // Odejmowanie punktu za strzał
        this.score = Math.max(0, this.score - 3);
        this.updateScoreDisplay();

        // Tworzymy pocisk
        const bulletGeometry = new THREE.SphereGeometry(2);
        const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
        bullet.name = 'bullet';

        // Obliczamy kierunek strzału
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(this.airplane.quaternion);
        
        // Przesuwamy pocisk 15 jednostek przed samolot (zwiększona odległość)
        bullet.position.copy(this.airplane.position).add(direction.multiplyScalar(15));
        
        // Ustawiamy prędkość pocisku
        const velocity = direction.normalize().multiplyScalar(20); // Zwiększona prędkość
        bullet.userData.velocity = velocity;
        bullet.userData.timeCreated = now;
        bullet.userData.shooterId = this.airplane.id; // Zapisujemy ID strzelającego samolotu

        this.bullets.push(bullet);
        this.scene.add(bullet);
    }

    private createExplosion(position: THREE.Vector3, scale: number = 1): void {
        const particleCount = 20;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount;
            const radius = 5 * scale;
            
            positions[i * 3] = Math.cos(angle) * radius;
            positions[i * 3 + 1] = Math.sin(angle) * radius;
            positions[i * 3 + 2] = 0;

            colors[i * 3] = 1;     // R
            colors[i * 3 + 1] = 0.7; // G
            colors[i * 3 + 2] = 0;   // B
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 2,
            vertexColors: true,
            transparent: true,
            opacity: 1
        });

        const explosion = new THREE.Points(geometry, material);
        explosion.position.copy(position);
        explosion.userData.createdAt = Date.now();
        explosion.userData.scale = scale;

        this.explosions.push(explosion);
        this.scene.add(explosion);
    }

    private updateExplosions(): void {
        const now = Date.now();
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const explosion = this.explosions[i];
            const age = now - explosion.userData.createdAt;
            
            if (age > 1000) {
                this.scene.remove(explosion);
                this.explosions.splice(i, 1);
            } else {
                const scale = 1 + (age / 1000) * 2;
                explosion.scale.set(scale, scale, scale);
                (explosion.material as THREE.PointsMaterial).opacity = 1 - (age / 1000);
            }
        }
    }

    private checkCollisions(): void {
        if (this.isGameOver || this.isGameWon) return;

        const airplaneBox = new THREE.Box3().setFromObject(this.airplane);

        // Sprawdzanie kolizji z terenem
        if (this.airplane.position.y < 10) {
            this.gameOver();
            return;
        }

        // Sprawdzanie kolizji z obiektami
        for (const object of this.scene.children) {
            // Pomijamy chmury i inne obiekty bez kolizji
            if (object === this.airplane || 
                object === this.terrain || 
                this.clouds.includes(object as THREE.Mesh) ||
                this.explosions.includes(object as THREE.Points)) {
                continue;
            }

            // Sprawdzanie kolizji z budynkami, górami i drzewami
            if (object instanceof THREE.Mesh || object instanceof THREE.Group) {
                const objectBox = new THREE.Box3().setFromObject(object);
                if (airplaneBox.intersectsBox(objectBox)) {
                    this.gameOver();
                    return;
                }
            }
        }
    }

    private gameOver(): void {
        this.isGameOver = true;
        this.createExplosion(this.airplane.position, 3);
        this.airplane.visible = false;

        // Tworzenie ekranu końca gry
        this.gameOverScreen = document.createElement('div');
        this.gameOverScreen.style.position = 'fixed';
        this.gameOverScreen.style.top = '50%';
        this.gameOverScreen.style.left = '50%';
        this.gameOverScreen.style.transform = 'translate(-50%, -50%)';
        this.gameOverScreen.style.background = 'rgba(0, 0, 0, 0.8)';
        this.gameOverScreen.style.color = 'white';
        this.gameOverScreen.style.padding = '20px';
        this.gameOverScreen.style.borderRadius = '10px';
        this.gameOverScreen.style.textAlign = 'center';

        const gameOverText = document.createElement('h1');
        gameOverText.textContent = 'GAME OVER';
        this.gameOverScreen.appendChild(gameOverText);

        const restartButton = document.createElement('button');
        restartButton.textContent = 'Restart';
        restartButton.style.padding = '10px 20px';
        restartButton.style.fontSize = '18px';
        restartButton.style.marginTop = '20px';
        restartButton.style.cursor = 'pointer';
        restartButton.onclick = () => this.restartGame();
        this.gameOverScreen.appendChild(restartButton);

        document.body.appendChild(this.gameOverScreen);
    }

    private restartGame(): void {
        if (this.gameOverScreen) {
            document.body.removeChild(this.gameOverScreen);
            this.gameOverScreen = null;
        }

        // Czyszczenie sceny
        while(this.scene.children.length > 0){ 
            this.scene.remove(this.scene.children[0]); 
        }

        // Reset stanu gry
        this.isGameOver = false;
        this.isGameWon = false;
        this.isGameStarted = false;
        this.cats = [];
        this.clouds = [];
        this.bullets = [];
        this.explosions = [];
        this.bigCat = null;

        // Pokazanie ekranu wyboru trudności
        this.difficultyScreen.style.display = 'block';
        this.scoreDisplay.style.display = 'none';
    }

    private updateBullets(): void {
        const now = Date.now();

        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.position.add(bullet.userData.velocity);

            let hasCollision = false;

            // Najpierw sprawdzamy kolizje z kotami
            for (const cat of this.cats) {
                if (this.checkCollision(bullet, cat)) {
                    console.log('Trafienie w kota!');
                    this.score += 12;
                    this.updateScoreDisplay();
                    this.createExplosion(bullet.position.clone());
                    hasCollision = true;
                    break;
                }
            }

            // Jeśli nie było kolizji z kotem, sprawdzamy inne obiekty
            if (!hasCollision) {
                for (const object of this.scene.children) {
                    if (object instanceof THREE.Mesh && 
                        object !== bullet && 
                        object !== this.terrain && 
                        object !== this.afterburnerMesh &&
                        !this.clouds.includes(object)) {
                        
                        if (this.checkCollision(bullet, object)) {
                            this.createExplosion(bullet.position.clone());
                            hasCollision = true;
                            break;
                        }
                    }
                }
            }

            // Sprawdzamy kolizję z terenem
            if (bullet.position.y <= 0) {
                hasCollision = true;
                this.createExplosion(bullet.position.clone());
            }

            if (hasCollision || now - bullet.userData.timeCreated > 2000) {
                this.scene.remove(bullet);
                this.bullets.splice(i, 1);
            }
        }
    }

    private checkCollision(object1: THREE.Object3D, object2: THREE.Object3D): boolean {
        // Ignorujemy kolizje między pociskiem a samolotem
        if ((object1.name === 'bullet' && object2 === this.airplane) ||
            (object2.name === 'bullet' && object1 === this.airplane)) {
            return false;
        }

        // Ignorujemy kolizje z chmurami i efektami
        if (this.clouds.includes(object1 as THREE.Mesh) || 
            this.clouds.includes(object2 as THREE.Mesh) ||
            this.explosions.includes(object1 as THREE.Points) || 
            this.explosions.includes(object2 as THREE.Points)) {
            return false;
        }

        const box1 = new THREE.Box3().setFromObject(object1);
        const box2 = new THREE.Box3().setFromObject(object2);
        return box1.intersectsBox(box2);
    }

    private onMouseDown(event: MouseEvent): void {
        if (!this.isPointerLocked) return;

        if (event.button === 0) {
            this.shoot();
        } else if (event.button === 2) {
            this.isBoostActive = true;
            this.speed = this.baseSpeed * 3;
            this.afterburner.intensity = 20; // Zwiększona intensywność podczas dopalania
            (this.afterburnerMesh.material as THREE.MeshBasicMaterial).opacity = 0.8;
        }
    }

    private onMouseUp(event: MouseEvent): void {
        if (event.button === 2) {
            this.isBoostActive = false;
            this.speed = this.baseSpeed;
            this.afterburner.intensity = 0;
            (this.afterburnerMesh.material as THREE.MeshBasicMaterial).opacity = 0;
        }
    }

    private updateScore(): void {
        const now = Date.now();
        const deltaTime = now - this.lastScoreUpdate;

        // Odejmowanie punktu co sekundę
        if (deltaTime >= 1000 && this.score > 0 && !this.isGameOver && !this.isGameWon) {
            this.score = Math.max(0, this.score - 1);
            this.lastScoreUpdate = now;
        }

        // Sprawdzanie wygranej
        if (this.score >= 120 && !this.isGameWon) {
            this.gameWon();
        }

        this.updateScoreDisplay();
    }

    private updateScoreDisplay(): void {
        this.scoreDisplay.textContent = `Punkty: ${this.score}/120`;
    }

    private gameWon(): void {
        this.isGameWon = true;
        
        const winScreen = document.createElement('div');
        winScreen.style.position = 'fixed';
        winScreen.style.top = '50%';
        winScreen.style.left = '50%';
        winScreen.style.transform = 'translate(-50%, -50%)';
        winScreen.style.background = 'rgba(0, 255, 0, 0.8)';
        winScreen.style.color = 'white';
        winScreen.style.padding = '20px';
        winScreen.style.borderRadius = '10px';
        winScreen.style.textAlign = 'center';
        winScreen.style.fontSize = '24px';

        winScreen.innerHTML = `
            <h1>WYGRANA!</h1>
            <p>Zdobyłeś 120 punktów!</p>
            <button style="padding: 10px 20px; font-size: 18px; margin-top: 20px; cursor: pointer;">
                Zagraj ponownie
            </button>
        `;

        document.body.appendChild(winScreen);
        const restartButton = winScreen.querySelector('button');
        if (restartButton) {
            restartButton.onclick = () => {
                document.body.removeChild(winScreen);
                this.restartGame();
            };
        }
    }

    private updateVisibility(): void {
        const now = Date.now();
        if (now - this.lastCullingTime < FlightSimulator.CULLING_INTERVAL) return;
        this.lastCullingTime = now;

        this.camera.updateMatrixWorld();
        this.cameraViewMatrix.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        );
        this.frustum.setFromProjectionMatrix(this.cameraViewMatrix);

        for (const object of this.objectsToUpdate) {
            if (!object.userData.boundingSphere) {
                object.userData.boundingSphere = new THREE.Sphere();
                const box = new THREE.Box3().setFromObject(object);
                box.getBoundingSphere(object.userData.boundingSphere);
            }

            const distance = this.camera.position.distanceTo(object.position);
            const sphere = object.userData.boundingSphere.clone();
            sphere.center.copy(object.position);

            object.visible = distance < FlightSimulator.VIEW_DISTANCE && 
                           this.frustum.intersectsSphere(sphere);
        }
    }

    private animate(): void {
        if (this.isGameOver || this.isGameWon) {
            this.updateExplosions();
            this.renderer.render(this.scene, this.camera);
            requestAnimationFrame(this.animate.bind(this));
            return;
        }

        requestAnimationFrame(this.animate.bind(this));
        
        if (!this.isGameStarted) {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        // Optymalizacja aktualizacji
        this.updateVisibility();
        this.updateScore();
        this.checkCollisions();
        
        // Optymalizacja animacji chmur
        const time = Date.now() * 0.001;
        this.clouds.forEach((cloud, index) => {
            if (cloud.visible) {
                cloud.position.x += 0.2;
                if (cloud.position.x > 10000) {
                    cloud.position.x = -10000;
                }
            }
        });

        // Optymalizacja animacji kotów
        this.cats.forEach((cat, index) => {
            if (cat.visible) {
                const radius = 2000;
                const height = 1500 + Math.sin(time + index) * 200;
                const angle = time * 0.2 + (Math.PI * 2 * index) / 5;

                cat.position.x = Math.cos(angle) * radius;
                cat.position.z = Math.sin(angle) * radius;
                cat.position.y = height;

                cat.rotation.y = -angle + Math.PI / 2;

                const tail = cat.children[3];
                tail.rotation.z = Math.PI / 4 + Math.sin(time * 5) * 0.2;
            }
        });

        this.updateBullets();
        this.updateExplosions();
        this.updatePlanePosition();
        this.renderer.render(this.scene, this.camera);
    }
}

// Uruchomienie symulatora
console.log('Uruchamianie symulatora...');
new FlightSimulator(); 