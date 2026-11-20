/**
 * Known matchup patterns the feature model can't see on its own — a specific
 * ability interaction that decides the lane. `d` is the swing applied to the
 * lane-phase score for A playing into B (positive = A is favoured).
 *
 * These are qualitative, widely-agreed lane dynamics, not scraped win rates.
 */
export interface CounterNote { a: string; b: string; d: number; why: string }

export const COUNTERS: CounterNote[] = [
  // --- point-click / suppression beats mobility-reliant carries ---
  { a: 'Malzahar', b: 'Zed', d: 0.55, why: 'Malzahar\'s passive shield eats the ultimate mark and his R suppresses through a dash' },
  { a: 'Malzahar', b: 'Yasuo', d: 0.45, why: 'Voidlings plus suppression punish a champion that has to walk forward to trade' },
  { a: 'Malzahar', b: 'Katarina', d: 0.40, why: 'Suppression cancels her ultimate outright' },
  { a: 'Lissandra', b: 'Zed', d: 0.35, why: 'Zhonya-on-a-button ultimate blanks his all-in window' },
  { a: 'Kayle', b: 'Zed', d: 0.30, why: 'Her ultimate makes her untargetable through the full combo' },
  { a: 'Zilean', b: 'Zed', d: 0.35, why: 'Revive negates the assassination entirely' },
  { a: 'TahmKench', b: 'Zed', d: 0.25, why: 'Shield and reposition break the burst window' },
  { a: 'Pantheon', b: 'Zed', d: 0.30, why: 'Passive blocks the first auto and Q poke wins every short trade' },

  // --- sustain / block beats poke ---
  { a: 'Soraka', b: 'Xerath', d: 0.30, why: 'Heal output outpaces artillery chip damage' },
  { a: 'Braum', b: 'Caitlyn', d: 0.30, why: 'Unbreakable blocks the headshot and net poke pattern' },
  { a: 'Yasuo', b: 'Xerath', d: 0.40, why: 'Windwall eats the entire poke pattern' },
  { a: 'Yasuo', b: 'Varus', d: 0.30, why: 'Windwall blanks the poke and the ultimate' },
  { a: 'Yone', b: 'Xerath', d: 0.30, why: 'Windwall denies artillery poke' },
  { a: 'Samira', b: 'Caitlyn', d: 0.25, why: 'W spins away every projectile in the lane' },
  { a: 'Sivir', b: 'Blitzcrank', d: 0.45, why: 'Spell shield makes the hook a free kill for her side' },
  { a: 'Sivir', b: 'Thresh', d: 0.35, why: 'Spell shield blanks the hook' },
  { a: 'Morgana', b: 'Blitzcrank', d: 0.50, why: 'Black Shield makes the hook useless and gives her lane control' },
  { a: 'Morgana', b: 'Leona', d: 0.40, why: 'Black Shield blanks the entire engage chain' },
  { a: 'Morgana', b: 'Thresh', d: 0.35, why: 'Black Shield blanks the hook' },
  { a: 'Nocturne', b: 'Syndra', d: 0.30, why: 'Spell shield absorbs the stun and he is on top of her instantly' },

  // --- range and waveclear beats melee ---
  { a: 'Teemo', b: 'Darius', d: 0.50, why: 'Blind plus range means he never lands a Q or pull' },
  { a: 'Teemo', b: 'Garen', d: 0.45, why: 'Blind and kite beat a melee with no gap closer' },
  { a: 'Teemo', b: 'Illaoi', d: 0.40, why: 'Ranged poke avoids tentacle range entirely' },
  { a: 'Vayne', b: 'Darius', d: 0.35, why: 'Condemn and range keep her out of every trade he wants' },
  { a: 'Quinn', b: 'Sett', d: 0.35, why: 'Blind and range shut down a short-range juggernaut' },
  { a: 'Jayce', b: 'Mordekaiser', d: 0.35, why: 'Hammer-to-cannon poke wins before his ultimate is up' },
  { a: 'Gnar', b: 'Darius', d: 0.30, why: 'Mini Gnar kites out of pull range all laning phase' },
  { a: 'Vladimir', b: 'Yone', d: 0.30, why: 'Pool dodges the whole combo and he out-sustains the poke' },
  { a: 'Heimerdinger', b: 'Yasuo', d: 0.35, why: 'Turrets hold the wave and punish every dash in' },

  // --- grievous/anti-sustain and %hp beats bruisers ---
  { a: 'Vayne', b: 'Chogath', d: 0.40, why: 'True damage on the third proc melts stacked health' },
  { a: 'Fiora', b: 'Sion', d: 0.40, why: 'Vitals plus true damage ultimate shred a pure-health tank' },
  { a: 'Fiora', b: 'Malphite', d: 0.35, why: 'Parry blanks the engage and vitals punish a slow melee' },
  { a: 'Kayle', b: 'Nasus', d: 0.30, why: 'Ranged form denies stacks and outscales him hard' },
  { a: 'Trundle', b: 'Sion', d: 0.35, why: 'His ultimate steals the exact stat the enemy builds' },
  { a: 'Trundle', b: 'Mordekaiser', d: 0.30, why: 'Pillar plus resistance steal breaks the 1v1 ultimate' },

  // --- early pressure beats scaling ---
  { a: 'Renekton', b: 'Nasus', d: 0.45, why: 'He wins every level 1-6 trade and denies stacks' },
  { a: 'Darius', b: 'Nasus', d: 0.40, why: 'Pull plus bleed denies stacking from level 1' },
  { a: 'Pantheon', b: 'Kassadin', d: 0.45, why: 'Pre-6 he can simply kill a champion that wants to reach 16' },
  { a: 'Leblanc', b: 'Kassadin', d: 0.40, why: 'Burst from range before his scaling comes online' },
  { a: 'Draven', b: 'KogMaw', d: 0.35, why: 'Lane bully against the slowest scaling marksman' },
  { a: 'Caitlyn', b: 'KogMaw', d: 0.30, why: 'Range advantage denies farm for twenty minutes' },
  { a: 'Olaf', b: 'Fiora', d: 0.30, why: 'True damage ultimate ignores the parry and he out-trades early' },

  // --- anti-mobility ---
  { a: 'Nasus', b: 'Riven', d: 0.25, why: 'Wither turns a dash-reliant skirmisher into a free kill' },
  { a: 'Poppy', b: 'Camille', d: 0.40, why: 'W denies every dash and hook engage she has' },
  { a: 'Poppy', b: 'Irelia', d: 0.35, why: 'Her W cancels the dash-reset pattern' },
  { a: 'Poppy', b: 'LeeSin', d: 0.35, why: 'Dash denial breaks his whole kit' },
  { a: 'Cassiopeia', b: 'Yasuo', d: 0.30, why: 'Her ultimate punishes a forward dash and her grounding stops the dashes' },
  { a: 'Vex', b: 'Zed', d: 0.40, why: 'Her passive and ultimate are built to punish dash assassins' },
  { a: 'Vex', b: 'Katarina', d: 0.35, why: 'Fear and mark punish every blink' },

  // --- engage into immobile ---
  { a: 'Malphite', b: 'Yasuo', d: 0.35, why: 'Armour stacking blanks the lane and his ultimate is unavoidable' },
  { a: 'Malphite', b: 'Tryndamere', d: 0.35, why: 'Armour plus attack-speed slow neutralises an auto-attacker' },
  { a: 'Rammus', b: 'MasterYi', d: 0.45, why: 'Thornmail and taunt turn his own damage against him' },
  { a: 'Rammus', b: 'Tryndamere', d: 0.40, why: 'Spiked shell punishes raw auto-attack damage' },
  { a: 'Renekton', b: 'Ryze', d: 0.35, why: 'Two dashes and a stun cut through an immobile channel caster' },
  { a: 'Zed', b: 'Xerath', d: 0.35, why: 'He dives an immobile artillery mage at six' },
  { a: 'Talon', b: 'Orianna', d: 0.30, why: 'Roam pressure and burst on an immobile mage' },
  { a: 'Khazix', b: 'Karthus', d: 0.35, why: 'Isolation damage against the least mobile jungler' },

  // --- support dynamics ---
  { a: 'Leona', b: 'Soraka', d: 0.35, why: 'Hard engage beats a healer with no escape' },
  { a: 'Nautilus', b: 'Yuumi', d: 0.35, why: 'Point-click CC on the carry the moment she detaches' },
  { a: 'Pyke', b: 'Soraka', d: 0.30, why: 'Execute ignores healing output' },
  { a: 'Blitzcrank', b: 'Yuumi', d: 0.30, why: 'One hook on the ADC ends the lane' },
  { a: 'Janna', b: 'Leona', d: 0.35, why: 'Disengage blanks every engage attempt' },
  { a: 'Janna', b: 'Rakan', d: 0.30, why: 'Tornado and shield break the engage window' },
  { a: 'Lulu', b: 'Nautilus', d: 0.30, why: 'Polymorph and knock-up break the engage chain' },
  { a: 'Zyra', b: 'Senna', d: 0.25, why: 'Plant damage out-trades a low-range poke support' },

  // --- jungle dynamics ---
  { a: 'LeeSin', b: 'Karthus', d: 0.35, why: 'Early invade pressure against a weak early clear' },
  { a: 'XinZhao', b: 'Evelynn', d: 0.35, why: 'His ultimate and early power punish a weak pre-6 jungler' },
  { a: 'Warwick', b: 'MasterYi', d: 0.30, why: 'Fear and sustain beat him in every early duel' },
  { a: 'Shaco', b: 'Nunu', d: 0.30, why: 'Box control and invade tempo beat a clear-focused jungler' },
]

const index = new Map<string, CounterNote>()
for (const c of COUNTERS) index.set(`${c.a}|${c.b}`, c)

export function counterNote(a: string, b: string): { d: number; why: string } | null {
  const direct = index.get(`${a}|${b}`)
  if (direct) return { d: direct.d, why: direct.why }
  const reverse = index.get(`${b}|${a}`)
  if (reverse) return { d: -reverse.d, why: reverse.why }
  return null
}
