window.onload = function() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    const background = new Image();
    background.src = 'fundo.png';

    const rocketImage = new Image();
    rocketImage.src = 'foguete.png';

    const rocketAcceleratingImage = new Image();
    rocketAcceleratingImage.src = 'foguete_acelerando.png';

    const ship = new Image();
    ship.src = 'navio.png';

    const collectibleImage = new Image();
    collectibleImage.src = 'coleta.png';

    class Collectible {
        constructor() {
            this.width = 150;
            this.height = 100;
            this.reset();
            this.speedX = 0;
            this.speedY = 0;
        }

        reset() {
            this.x = (canvas.width * 0.3) + Math.random() * (canvas.width * 0.4);
            this.y = (canvas.height * 0.3) + Math.random() * (canvas.height * 0.4);
            this.speedX = (Math.random() - 0.5) * 2;
            this.speedY = (Math.random() - 0.5) * 2;
        }

        updatePosition() {
            this.x += this.speedX;
            this.y += this.speedY;

            if (this.x < 0 || this.x > canvas.width - this.width) {
                this.speedX *= -1;
            }
            if (this.y < 0 || this.y > canvas.height - this.height) {
                this.speedY *= -1;
            }
        }

        draw(ctx) {
            ctx.drawImage(collectibleImage, this.x, this.y, this.width, this.height);
        }
    }

    let wind = 0;

    class Rocket {
        constructor(brain, baseX, baseY) {
            this.width = 340;
            this.height = 190;
            this.x = baseX;
            this.y = baseY;
            this.speedX = 0;
            this.speedY = 0;
            this.angle = 0;
            this.isAccelerating = false;
            this.brain = brain || new neataptic.architect.Perceptron(6, 16, 2);
            this.fitness = 0;
            this.isActive = true; // Inicialmente ativo
        }

        updatePosition(gravity, drag) {
            const inputs = [
                (this.x + this.width / 2) / canvas.width,
                (this.y + this.height / 2) / canvas.height,
                (collectible.x + collectible.width / 2 - (this.x + this.width / 2)) / canvas.width,
                (collectible.y + collectible.height / 2 - (this.y + this.height / 2)) / canvas.height,
                Math.sin(this.angle),
                Math.cos(this.angle)
            ];

            const output = this.brain.activate(inputs);

            const max_acceleration = 0.3;
            const acceleration = output[0] * max_acceleration;

            this.speedY -= acceleration * Math.cos(this.angle);
            this.speedX += acceleration * Math.sin(this.angle);

            this.speedX += wind;
            this.isAccelerating = (output[0] > 0);

            const rotationSpeed = 0.5;
            this.angle += (output[1] - 0.5) * rotationSpeed;

            this.speedX *= drag;
            this.speedY += gravity;

            this.x += this.speedX;
            this.y += this.speedY;
        }

        draw(ctx) {
            ctx.save();
            ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
            ctx.rotate(this.angle);
            const image = this.isAccelerating ? rocketAcceleratingImage : rocketImage;
            ctx.globalAlpha = 1;  // Sem redução de opacidade
            ctx.drawImage(image, -this.width / 2, -this.height / 2, this.width, this.height);
            ctx.restore();
        }

        calculateFitness(collectible) {
            // Cálculo direto do fitness pela distância
            const dx = this.x + this.width / 2 - (collectible.x + collectible.width / 2);
            const dy = this.y + this.height / 2 - (collectible.y + collectible.height / 2);
            const distance = Math.sqrt(dx * dx + dy * dy);
            this.fitness = Math.max(0, 1000 - distance);  // Fitness baseado apenas na distância
        }
    }

    let shipX = 90;
    let shipY = 0;
    const gravity = 0.2;
    const drag = 0.99;

    const collectible = new Collectible();

    const NEAT_POPULATION = 1000;
    const neat = new neataptic.Neat(6, 2, null, {
        mutation: [
            neataptic.methods.mutation.ADD_NODE,
            neataptic.methods.mutation.SUB_NODE,
            neataptic.methods.mutation.ADD_CONN,
            neataptic.methods.mutation.SUB_CONN,
            neataptic.methods.mutation.MOD_WEIGHT,
            neataptic.methods.mutation.MOD_BIAS,
            neataptic.methods.mutation.MOD_ACTIVATION,
            neataptic.methods.mutation.ADD_SELF_CONN,
            neataptic.methods.mutation.ADD_GATE,
            neataptic.methods.mutation.SUB_GATE,
            neataptic.methods.mutation.ADD_BACK_CONN
        ],
        popsize: NEAT_POPULATION,
        mutationRate: 0.3,
        elitism: Math.round(0.2 * NEAT_POPULATION),
        network: new neataptic.architect.Perceptron(6, 16, 2)
    });

    let rockets = [];
    let frameCount = 0;
    let bestFitness = 0;
    let bestRocket = null;

    function initNeat() {
        const baseX = Math.random() * (canvas.width - 340);
        const baseY = Math.random() * (canvas.height / 2);

        rockets = neat.population.map(brain => new Rocket(brain, baseX, baseY));
        frameCount = 0;
        neat.sort();
        bestFitness = neat.population[0].fitness; // Inicialização de bestFitness
        bestRocket = rockets[0];
    }

    function getFrameLimitForGeneration(generation) {
        if (generation < 160) {
            return 500;
        } else {
            return 2000;
        }
    }

    function updateNeat() {
        rockets.forEach((rocket, index) => {
            rocket.calculateFitness(collectible);
            neat.population[index].score = rocket.fitness; // Atualiza o score com o fitness calculado
        });

        neat.sort();
        bestFitness = neat.population[0].score; // Atualização de bestFitness
        bestRocket = rockets[neat.population[0].index]; // Atualização de bestRocket

        const newPopulation = [];

        for (let i = 0; i < neat.elitism; i++) {
            newPopulation.push(neat.population[i]);
        }

        for (let i = 0; i < neat.popsize - neat.elitism; i++) {
            newPopulation.push(neat.getOffspring());
        }

        neat.population = newPopulation;
        neat.mutate();

        neat.generation++;

        const baseX = Math.random() * (canvas.width - 340);
        const baseY = Math.random() * (canvas.height / 2);
        rockets = neat.population.map(genome => new Rocket(genome, baseX, baseY));

        collectible.reset();

        wind = (Math.random() - 0.5) * 0.1;
    }

    background.onload = function() {
        ctx.drawImage(background, 0, 0, background.width, background.height, 0, 0, canvas.width, canvas.height);
    };

    ship.onload = function() {
        shipY = canvas.height - ship.height;
        initNeat();
        requestAnimationFrame(gameLoop);
    };

    function gameLoop() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
    
        collectible.updatePosition();
    
        rockets.forEach(rocket => {
            rocket.updatePosition(gravity, drag);
            rocket.draw(ctx);
        });
    
        ctx.drawImage(ship, shipX, shipY, ship.width, ship.height);
        collectible.draw(ctx);
    
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.fillText(`Generation: ${neat.generation}`, 10, 20);
    
        // Verifique se bestFitness é um número antes de tentar formatá-lo
        if (typeof bestFitness === "number") {
            ctx.fillText(`Best Fitness: ${bestFitness.toFixed(2)}`, 10, 40);
        } else {
            ctx.fillText(`Best Fitness: N/A`, 10, 40);
        }
    
        // Verifique se bestRocket está definido antes de tentar acessar suas propriedades
        if (bestRocket) {
            let bestDistance = Math.sqrt(
                Math.pow(bestRocket.x + bestRocket.width / 2 - (collectible.x + collectible.width / 2), 2) +
                Math.pow(bestRocket.y + bestRocket.height / 2 - (collectible.y + collectible.height / 2), 2)
            );
            ctx.fillText(`Best Distance: ${bestDistance.toFixed(2)}`, 10, 60);
        } else {
            ctx.fillText(`Best Distance: N/A`, 10, 60);
        }
    
        frameCount++;
        let frameLimit = getFrameLimitForGeneration(neat.generation);
        if (frameCount >= frameLimit || rockets.every(rocket => !rocket.isActive)) {
            frameCount = 0;
            updateNeat();
        }
    
        requestAnimationFrame(gameLoop);
    }
};