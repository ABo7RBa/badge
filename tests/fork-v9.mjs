import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeRoom,choose,sent,packs} from '../src/db.js';
import {getOwnDiscordPair} from '../src/member-source.js';
const root=new URL('../',import.meta.url);
const bot=fs.readFileSync(new URL('../src/bot.js',import.meta.url),'utf8');
const media=fs.readFileSync(new URL('../src/media.js',import.meta.url),'utf8');
assert.match(bot, /const output=await renderCard\(picked\)/);
assert.doesNotMatch(bot,/bannerCandidates\(gid,picked\.category/);
assert.doesNotMatch(bot,/nextBanner\(r,candidates/);
assert.match(bot,/new AttachmentBuilder\(\(await import\('\.\/db\.js'\)\)\.mediaPath\(p\.banner\)/);
assert.match(media,/if\(!bannerRaw\)throw Error/);
assert.match(media,/if\(Buffer\.compare\(raw,bannerRaw\)===0\|\|avHash===bnHash\)/);
assert.match(bot,/if\(!\['anime','girls','boys','pc_wallpapers','movies'\]\.includes\(category\)\)/);
assert.match(bot,/\['anime','girls','boys'\]/);
assert.equal(makeRoom('girls').minutes,40);
assert.throws(()=>makeRoom('dark'));
// Opt-in source: can read requester only; mock only, no network or Discord token.
const client={users:{fetch:async (id,opts)=>({id,displayAvatarURL:()=>`https://cdn.discordapp.com/a/${id}.png`,bannerURL:()=>`https://cdn.discordapp.com/b/${id}.png`})}};
const id='123456789012345678';
const pair=await getOwnDiscordPair(client,id);
assert.ok(pair.avatarURL.includes(id));
assert.ok(pair.bannerURL.includes(id));
await assert.rejects(getOwnDiscordPair(client,'-1'));
const room=makeRoom('anime');const seen=new Set();
for(let n=0;n<2;n++){const p=choose('v9-tests',room);if(!p)break;assert.ok(!seen.has(p.id));seen.add(p.id);sent(room,p.id);}
console.log('PASS: Pfp-Bot opt-in source, curated paired media, five sections, 40min, non-repeating packs');
