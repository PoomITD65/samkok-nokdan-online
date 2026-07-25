# General Ability Test Suite — Results

Unit tests that call the game engine's exported functions directly (no server,
no sockets) with a mock prompt-answering `io`, so each general's ability can be
verified in isolation and deterministically.

**Run it:** `node test_generals.mjs` (from the `webapp/` folder, no server needs to be running)

**Latest result: 25/25 passed**

| # | General (TH) | General (EN) | What the test checks | Status |
|---|---|---|---|---|
| g1 | โจโฉ | Cao Cao | Reclaims a trick card from the discard pile on attack success | ✅ |
| g2 | ซุนเกี๋ยน | Sun Jian | Continuous: any hand card can fuel an attack | ✅ |
| g3 | เตียวเหลียง | Zhang Liang | Steals a random card from the defender on attack success | ✅ |
| g4 | โยจิ๋น | Yo Jin (He Jin) | Passively grants Vice-Marshal abilities; action button only enables when a VM is action-type | ✅ |
| g5 | ง่อฮูหยิน | Lady Wu | Continuous: immune to others' tricks, not her own | ✅ |
| g6 | ม้าอ้วนยี่ | Ma Wan-yi | Punishes a card-user by discarding an Attack card | ✅ |
| g7 | เล่าปี่ | Liu Bei | Recruits ANY general directly from the whole pool (no random-5) | ✅ |
| g8 | เตียวเสี้ยน | Diao Chan | Redirects an attack onto another player | ✅ |
| g9 | ลิโป้ | Lü Bu | Deals 2 infantry loss instead of 1 on a successful attack (full `performAttack`) | ✅ |
| g10 | โลติด | Luo Zhi | Allows a trick card to be used in place of a Defense card | ✅ |
| g11 | ตั๋งโต๊ะ | Dong Zhuo | Continuous: free attack vs. camps of 2 or fewer generals | ✅ |
| g12 | กองซุนจ้าน | Gongsun Zan | Action ability = spend 1 infantry, draw 2 (mirrors the base infantry ability) | ✅ |
| g13 | กวนอู | Guan Yu | Reveals defender's hand; extra loss + discard if an Attack card is found | ✅ |
| g14 | เตียวหุย | Zhang Fei | Draws 2 cards on attack success | ✅ |
| g15 | แฮหัวต้น | Xiahou Dun | Retaliates for 2 infantry when attacked and losing infantry | ✅ |
| g16 | ชุนยก | Xun You | Replaces the normal draw with "look at top 2, take 1" | ✅ |
| g17 | ตั๊กอิ๋ว | Tuo Yiu | Demands a card; refusal costs the target 1 infantry (chosen punishment) | ✅ |
| g18 | เตียวเหยียง | Zhang Rang | Continuous: immune to infantry-fueled attacks | ✅ |
| g19 | ชุนฮิว | Xun Yu | Draws 2 if the turn ends with no action taken | ✅ |
| g20 | เขาเฉียว | Khao Qiao | Reorders the top 3 deck cards correctly (rank 1 = drawn first) | ✅ |
| g21 | เซียนหนานหัว | Sage of Nanhua | Alternate revival cost (discard 2 cards instead of spending infantry) | ✅ |
| g22 | ฮองฮูสง | Huangfu Song | Extra loss + draw, ONLY when the attack was fueled by infantry | ✅ |
| g23 | จูล่ง | Zhao Yun | Attacks again immediately on success (once per turn) | ✅ |
| g24 | เตียวก๊ก | Zhang Jiao | Mandatory trick-card return, then chooses among multiple Taiping matches | ✅ |
| g25 | ซุนกวน | Sun Quan | Draws on attack success AND on any infantry loss (not just combat) | ✅ |

## Notes

- These are **unit tests** for the ability logic itself — they complement (not replace) `bot_test.mjs`, which exercises the full game loop (setup, turns, prompts, win conditions) through real sockets with randomized bot play.
- Several of these tests lock in fixes found during manual play-testing this session: the Khao Qiao reorder-direction bug, Zhang Jiao's optional-vs-mandatory cost, Sun Quan's combat-only vs. any-cause infantry trigger, and Yo Jin's passive-vs-button-press redesign.
- Re-run this suite after touching anything in `server/src/engine/` to catch regressions quickly.
