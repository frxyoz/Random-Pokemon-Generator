/** Team building state and logic */

type TeamMode = 'visible' | 'hidden';

const TEAM_SIZE = 6;
const DEFAULT_TEAM_MODE: TeamMode = 'visible';
const STORAGE_HIGH_SCORE_KEY_PREFIX = "highScore_";

interface TeamState {
	currentPokemon: GeneratedPokemon | null;
	team: GeneratedPokemon[];
	currentScore: number;
	highScore: number;
	usedStats: Set<CoreStatKey>;
	mode: TeamMode;
}

const teamState: TeamState = {
	currentPokemon: null,
	team: [],
	currentScore: 0,
	highScore: loadHighScore(DEFAULT_TEAM_MODE),
	usedStats: new Set(),
	mode: DEFAULT_TEAM_MODE
};

function getHighScoreKey(mode: TeamMode): string {
	return `${STORAGE_HIGH_SCORE_KEY_PREFIX}${mode}`;
}

function loadHighScore(mode: TeamMode): number {
	const stored = localStorage.getItem(getHighScoreKey(mode));
	return stored ? parseInt(stored) : 0;
}

function saveHighScore(mode: TeamMode, score: number): void {
	localStorage.setItem(getHighScoreKey(mode), score.toString());
}

/** Fetch Pokemon stats from PokeAPI */
async function fetchPokemonStats(pokemonId: number, formName?: string): Promise<PokemonStats> {
	try {
		// Build the Pokemon name/ID for the API with best-effort form handling
		let pokemonIdentifier: string | number = pokemonId;
		if (formName) {
			const baseSlug = formName.split(' ')[0].toLowerCase()
				.replace(/[éè]/g, 'e')
				.replace(/[^a-z0-9\s-]/g, '')
				.replace(/\s+/g, '-');
			const formSlug = formName.toLowerCase()
				.replace(/[éè]/g, 'e')
				.replace(/[^a-z0-9\s-]/g, '')
				.replace(/\s+/g, '-');
			
			// Heuristics for common form naming patterns in PokeAPI
			if (formSlug.includes('mega-x')) {
				pokemonIdentifier = `${baseSlug}-mega-x`;
			} else if (formSlug.includes('mega-y')) {
				pokemonIdentifier = `${baseSlug}-mega-y`;
			} else if (formSlug.includes('mega')) {
				pokemonIdentifier = `${baseSlug}-mega`;
			} else if (formSlug.includes('gigantamax')) {
				pokemonIdentifier = `${baseSlug}-gmax`;
			} else if (formSlug.includes('alola')) {
				pokemonIdentifier = `${baseSlug}-alola`;
			} else if (formSlug.includes('galar')) {
				pokemonIdentifier = `${baseSlug}-galar`;
			} else if (formSlug.includes('hisui')) {
				pokemonIdentifier = `${baseSlug}-hisui`;
			} else if (formSlug.includes('paldea')) {
				pokemonIdentifier = `${baseSlug}-paldea`;
			} else {
				pokemonIdentifier = formSlug;
			}
		}
		
		const url = `https://pokeapi.co/api/v2/pokemon/${pokemonIdentifier}`;
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch stats for Pokemon ${pokemonIdentifier}`);
		}
		const data = await response.json();
		
		// Extract base stats from the API response
		const statsMap: {[key: string]: number} = {};
		data.stats.forEach((stat: any) => {
			statsMap[stat.stat.name] = stat.base_stat;
		});
		
		// Get sprite URLs from API - prefer official artwork, fallback to default
		let spriteUrl = data.sprites?.other?.['official-artwork']?.front_default || 
		                data.sprites?.front_default || '';
		let shinySpriteUrl = data.sprites?.other?.['official-artwork']?.front_shiny ||
		                     data.sprites?.front_shiny || '';
		
		return {
			hp: statsMap['hp'] || 0,
			attack: statsMap['attack'] || 0,
			defense: statsMap['defense'] || 0,
			specialAttack: statsMap['special-attack'] || 0,
			specialDefense: statsMap['special-defense'] || 0,
			speed: statsMap['speed'] || 0,
			spriteUrl,
			shinySpriteUrl
		};
	} catch (error) {
		console.error('Error fetching Pokemon stats:', error);
		// Return default stats if fetch fails
		return {
			hp: 50,
			attack: 50,
			defense: 50,
			specialAttack: 50,
			specialDefense: 50,
			speed: 50
		};
	}
}

/** Generate a new Pokemon for team building */
async function generateTeamPokemon(): Promise<void> {
	if (teamState.team.length >= TEAM_SIZE) {
		alert('Your team is already complete! Start a new team to continue.');
		return;
	}

	markLoading(true);
	const options = getOptionsFromForm();
	// Force generate only 1 Pokemon
	options.n = 1;

	try {
		const eligiblePokemon = await getEligiblePokemon(options);
		const generatedPokemon = chooseRandom(eligiblePokemon, options);
		
		if (generatedPokemon.length > 0) {
			const pokemon = generatedPokemon[0];
			// Fetch stats from PokeAPI (pass form info if available)
			const formName = pokemon.baseName !== pokemon.name ? pokemon.name : undefined;
			pokemon.stats = await fetchPokemonStats(pokemon.id, formName);
			teamState.currentPokemon = pokemon;
			displayTeamBuilderUI();
		} else {
			displayPokemon(null);
		}
	} catch (error) {
		console.error(error);
		displayPokemon(null);
	}
	markLoading(false);
}

/** Select a stat and add Pokemon to team */
function selectStat(stat: CoreStatKey): void {
	if (!teamState.currentPokemon || !teamState.currentPokemon.stats) {
		return;
	}
	
	// Check if stat has already been used
	if (teamState.usedStats.has(stat)) {
		alert('This stat has already been selected!');
		return;
	}

	const statValue = teamState.currentPokemon.stats[stat] ?? 0;
	teamState.currentPokemon.selectedStat = stat;
	teamState.currentPokemon.selectedStatValue = statValue;
	
	// Mark stat as used
	teamState.usedStats.add(stat);
	
	// Add to score
	teamState.currentScore += statValue;
	
	// Add to team
	teamState.team.push(teamState.currentPokemon);
	
	// Update high score if needed
	if (teamState.currentScore > teamState.highScore) {
		teamState.highScore = teamState.currentScore;
		saveHighScore(teamState.mode, teamState.highScore);
	}
	
	// Clear current Pokemon
	teamState.currentPokemon = null;
	
	// If team is complete, show completion message
	if (teamState.team.length >= TEAM_SIZE) {
		displayTeamBuilderUI();
		showTeamComplete();
	} else {
		// Auto-generate next Pokemon
		generateTeamPokemon();
	}
}

/** Start a new team */
function startNewTeam(resetHighScore: boolean = false): void {
	teamState.team = [];
	teamState.currentScore = 0;
	teamState.currentPokemon = null;
	teamState.usedStats.clear();

	if (resetHighScore) {
		teamState.highScore = 0;
		saveHighScore(teamState.mode, 0);
	}

	displayTeamBuilderUI();
}

/** Switch team play mode and reset scores */
function setTeamMode(mode: TeamMode): void {
	if (teamState.mode === mode) {
		return;
	}
	teamState.mode = mode;
	startNewTeam(true);
}

/** Display the team builder UI */
function displayTeamBuilderUI(): void {
	const resultsContainer = document.getElementById("results");
	const hideStats = teamState.mode === 'hidden';
	
	let html = '<div class="team-builder">';

	// Mode toggle
	html += '<div class="team-mode-toggle">';
	html += '<span class="toggle-label">Mode</span>';
	html += `<label class="${teamState.mode === 'visible' ? 'active' : ''}">`;
	html += `<input type="radio" name="team-mode" ${teamState.mode === 'visible' ? 'checked' : ''} onclick="setTeamMode(\'visible\')"> Reveal stats`;
	html += '</label>';
	html += `<label class="${teamState.mode === 'hidden' ? 'active' : ''}">`;
	html += `<input type="radio" name="team-mode" ${teamState.mode === 'hidden' ? 'checked' : ''} onclick="setTeamMode(\'hidden\')"> Hidden stats`;
	html += '</label>';
	html += '</div>';
	
	// Current Pokemon and stat selection - AT THE TOP
	if (teamState.currentPokemon) {
		html += '<div class="stat-selection-wrapper">';
		
		// Left side: Current Pokemon
		html += '<div class="current-pokemon-section">';
		html += '<h2>Choose a Stat</h2>';
		
		html += '<div class="pokemon-stat-container">';
		
		// Pokemon display - custom HTML for team builder to avoid layout issues
		html += '<div class="pokemon-display">';
		const pokemon = teamState.currentPokemon;
		html += `<div class="pokemon-card">`;
		if (pokemon.showSprite) {
			html += `<img src="${getPokemonSpritePath(pokemon)}" alt="${pokemon.name}" />`;
		}
		if (pokemon.showName) {
			html += `<div class="pokemon-name">${getPokemonNameHtml(pokemon)}</div>`;
		}
		html += `</div>`;
		html += '</div>';
		
		// Stat buttons on the right
		if (teamState.currentPokemon.stats) {
			html += '<div class="stat-buttons">';
			const stats = teamState.currentPokemon.stats;
			const statButtons: Record<CoreStatKey, string> = {
				hp: 'HP',
				attack: 'Attack',
				defense: 'Defense',
				specialAttack: 'Sp. Atk',
				specialDefense: 'Sp. Def',
				speed: 'Speed'
			};
			const coreStatKeys: CoreStatKey[] = ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed'];
			// Calculate max stat for progress bar using only core stats
			const maxStat = Math.max(...coreStatKeys.map(k => stats[k] ?? 0), 1);
			
			for (const [key, label] of Object.entries(statButtons)) {
				const statKey = key as CoreStatKey;
				const value = stats[statKey] ?? 0;
				const isUsed = teamState.usedStats.has(statKey);
				const widthPercent = hideStats ? 0 : (value / maxStat) * 100;
				const displayValue = hideStats ? '???' : value;
				
				if (isUsed) {
					html += `<button class="stat-button used" disabled style="--stat-width: ${widthPercent}%">`;
					html += `<div class="stat-button-content">`;
					html += `<span class="stat-button-label">${label} ✓</span>`;
					html += `<span class="stat-button-value">${displayValue}</span>`;
					html += `</div>`;
					html += `</button>`;
				} else {
					html += `<button class="stat-button" onclick="selectStat('${key}')" style="--stat-width: ${widthPercent}%">`;
					html += `<div class="stat-button-content">`;
					html += `<span class="stat-button-label">${label}</span>`;
					html += `<span class="stat-button-value">${displayValue}</span>`;
					html += `</div>`;
					html += `</button>`;
				}
			}
			html += '</div>';
		}
		
		html += '</div>'; // close pokemon-stat-container
		html += '</div>'; // close current-pokemon-section
		
		// Right side: Chosen stats grid and score (vertical)
		html += '<div class="stat-selection-right">';
		html += '<div class="stat-grid">';
		const statLabels = {
			hp: 'HP',
			attack: 'ATK',
			defense: 'DEF',
			specialAttack: 'SP.A',
			specialDefense: 'SP.D',
			speed: 'SPD'
		};
		
		// Find max stat value for scaling bars
		const maxStatValue = Math.max(...teamState.team.map(p => p.selectedStatValue || 0), 200);
		
		for (const [key, label] of Object.entries(statLabels)) {
			const statKey = key as CoreStatKey;
			const pokemon = teamState.team.find(p => p.selectedStat === statKey);
			const value = pokemon ? pokemon.selectedStatValue : null;
			const isFilled = value !== null;
			const widthPercent = isFilled ? (value / maxStatValue) * 100 : 0;
			
			html += `<div class="stat-grid-item ${isFilled ? 'filled' : ''}">`;
			html += `<div class="stat-grid-header">`;
			html += `<span class="label">${label}</span>`;
			html += `<span class="value">${isFilled ? value : '—'}</span>`;
			html += '</div>';
			if (isFilled) {
				html += `<div class="stat-bar">`;
				html += `<div class="stat-bar-fill" style="width: ${widthPercent}%"></div>`;
				html += '</div>';
			}
			html += '</div>';
		}
		html += '</div>'; // close stat-grid
		
		// Score display - on right side below stat-grid
		html += '<div class="score-display">';
		html += '<div class="score-item">';
		html += '<span class="score-label">Current Score</span>';
		html += `<span class="score-value">${teamState.currentScore}</span>`;
		html += '</div>';
		html += '<div class="score-item">';
		html += '<span class="score-label">High Score</span>';
		html += `<span class="score-value">${teamState.highScore}</span>`;
		html += '</div>';
		html += '</div>';
		
		html += '</div>'; // close stat-selection-right
		html += '</div>'; // close stat-selection-wrapper
	} else {
		// Show generate button if no current Pokemon
		if (teamState.team.length < TEAM_SIZE) {
			html += '<div class="generate-section">';
			html += `<p>Team Progress: ${teamState.team.length} / ${TEAM_SIZE} Pokémon</p>`;
			html += '<button class="generate-btn" onclick="generateTeamPokemon()">Generate Next Pokémon</button>';
			html += '</div>';
		}
	}
	
	// Team display
	html += '<div class="team-display">';
	html += '<h3>Your Team</h3>';
	html += '<div class="team-slots">';
	
	for (let i = 0; i < TEAM_SIZE; i++) {
		if (i < teamState.team.length) {
			const pokemon = teamState.team[i];
			html += '<div class="team-slot filled">';
			// Show Pokemon without extra wrapper
			if (pokemon.showSprite) {
				html += `<img src="${getPokemonSpritePath(pokemon)}" alt="${pokemon.name}" />`;
			}
			if (pokemon.showName) {
				html += `<div class="pokemon-name">${getPokemonNameHtml(pokemon)}</div>`;
			}
			if (pokemon.selectedStat && pokemon.selectedStatValue !== undefined) {
				const statLabel = {
					hp: 'HP',
					attack: 'ATK',
					defense: 'DEF',
					specialAttack: 'SP.A',
					specialDefense: 'SP.D',
					speed: 'SPD'
				}[pokemon.selectedStat];
				html += `<div class="selected-stat">${statLabel}: ${pokemon.selectedStatValue}</div>`;
			}
			html += '</div>';
		} else {
			html += '<div class="team-slot empty">?</div>';
		}
	}
	
	html += '</div></div>';
	
	// New team button
	if (teamState.team.length > 0) {
		html += '<div class="controls">';
		html += '<button class="new-team-btn" onclick="startNewTeam()">Start New Team</button>';
		html += '</div>';
	}

	resultsContainer.innerHTML = html;
}
function showTeamComplete(): void {
	const message = teamState.currentScore === teamState.highScore && teamState.highScore > 0
		? '🎉 Congratulations! New High Score!'
		: '✅ Team Complete!';
	
	setTimeout(() => {
		alert(`${message}\n\nFinal Score: ${teamState.currentScore}\nHigh Score: ${teamState.highScore}`);
	}, 100);
}

/** Helper to get Pokemon sprite path */
function getPokemonSpritePath(pokemon: GeneratedPokemon): string {
	// If we have a sprite URL from PokeAPI, use it
	if (pokemon.stats) {
		const apiSprite = pokemon.shiny ? pokemon.stats.shinySpriteUrl : pokemon.stats.spriteUrl;
		if (apiSprite) {
			return apiSprite;
		}
	}
	
	// Fallback to local sprites
	const PATH_TO_SPRITES = 'sprites/normal/';
	const PATH_TO_SHINY_SPRITES = 'sprites/shiny/';
	const SPRITE_EXTENSION = '.webp';
	
	const path = pokemon.shiny ? PATH_TO_SHINY_SPRITES : PATH_TO_SPRITES;
	const baseName = pokemon.baseName || pokemon.name;
	let name = baseName.toLowerCase()
		.replaceAll('é', 'e')
		.replaceAll('♀', 'f')
		.replaceAll('♂', 'm')
		.replaceAll(/['.:% -]/g, '');
	
	return path + name + SPRITE_EXTENSION;
}

/** Helper to get Pokemon name HTML */
function getPokemonNameHtml(pokemon: GeneratedPokemon): string {
	let html = '';
	if (pokemon.nature) {
		html += `<span class="nature">${pokemon.nature}</span> `;
	}
	html += pokemon.name;
	
	// Gender symbol
	if (pokemon.name !== "Nidoran ♀" && pokemon.name !== "Nidoran ♂") {
		if (pokemon.gender === "male") {
			html += ` <span class="male" title="Male">♂</span>`;
		} else if (pokemon.gender === "female") {
			html += ` <span class="female" title="Female">♀</span>`;
		}
	}
	
	if (pokemon.shiny) {
		html += ` <span class="star">★</span>`;
	}
	
	return html;
}

/** Initialize team builder mode */
function initializeTeamBuilder(): void {
	// Auto-generate first Pokemon
	if (teamState.team.length === 0 && teamState.currentPokemon === null) {
		generateTeamPokemon();
	} else {
		displayTeamBuilderUI();
	}
}

// Expose functions to global scope for onclick handlers
(window as any).selectStat = selectStat;
(window as any).generateTeamPokemon = generateTeamPokemon;
(window as any).startNewTeam = startNewTeam;
(window as any).setTeamMode = setTeamMode;
