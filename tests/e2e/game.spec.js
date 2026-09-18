import { test, expect } from '@playwright/test';

async function installState(page, state, moveCount = 0) {
  await page.goto('/?e2e=1');
  await page.evaluate(({ nextState, nextMoveCount }) => {
    window.__DARK_CHESS_E2E__.setState(nextState, nextMoveCount);
  }, { nextState: state, nextMoveCount: moveCount });
}

test.describe('浏览器完整交互验收', () => {
  test('开局、固定 seed、选中暗棋、原地翻棋、重新开局', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#board .piece')).toHaveCount(32);
    await expect(page.locator('#board .piece.hidden')).toHaveCount(30);
    await expect(page.locator('#board .piece.revealed')).toHaveCount(2);
    await expect(page.locator('#turnText')).toHaveText('红方回合');
    await expect(page.locator('#phaseText')).toHaveText('对局进行中');
    await expect(page.locator('#moveCount')).toHaveText('0 手');

    await page.locator('#seedInput').fill('E2E-SEED-001');
    await page.locator('#restartBtn').click();
    await expect(page.locator('#seedText')).toContainText('E2E-SEED-001');
    await expect(page.locator('#seedInput')).toHaveValue('E2E-SEED-001');

    const hiddenRed = page.locator('#board .piece.red.hidden').first();
    await hiddenRed.click();
    await expect(hiddenRed).toHaveClass(/selected/);
    await expect(page.locator('#revealBtn')).toBeEnabled();
    await expect(page.locator('.target-cell')).not.toHaveCount(0);

    await page.locator('#revealBtn').click();
    await expect(page.locator('#turnText')).toHaveText('黑方回合');
    await expect(page.locator('#moveCount')).toHaveText('1 手');
    await expect(page.locator('.piece.red.revealed')).toHaveCount(2);
    await expect(page.locator('#log .log-entry').first()).toContainText('原地翻开');

    await page.locator('#restartBtn').click();
    await expect(page.locator('#moveCount')).toHaveText('0 手');
    await expect(page.locator('#turnText')).toHaveText('红方回合');
    await expect(page.locator('#log .log-entry')).toHaveCount(1);
  });

  test('暗棋移动后自动翻开并切换回合', async ({ page }) => {
    await page.goto('/');
    const hiddenRedId = await page.locator('#board .piece.red.hidden').first().getAttribute('data-piece-id');
    const hiddenRed = page.locator(`[data-piece-id="${hiddenRedId}"]`);
    await hiddenRed.click();
    await expect(page.locator(`[data-piece-id="${hiddenRedId}"]`)).toHaveClass(/selected/);

    const targets = page.locator('.target-cell');
    await expect(targets).not.toHaveCount(0);
    await targets.first().click();

    await expect(page.locator('#phaseText')).toHaveText('对局进行中', { timeout: 5_000 });
    await expect(page.locator('#turnText')).toHaveText('红方回合');
    await expect(page.locator('#moveCount')).toHaveText('1 手');
    await expect(page.locator('#board .piece.red.revealed')).toHaveCount(2);
    await expect(page.locator('#log .log-entry').first()).toContainText('移动并翻开');
  });

  test('真实点击完成吃暗棋且不揭示', async ({ page }) => {
    const state = {
      pieces: [
        { id: 'RED-ROOK', side: 'RED', x: 0, y: 9, originalType: 'rook', actualType: 'rook', revealed: true, alive: true },
        { id: 'BLACK-HIDDEN', side: 'BLACK', x: 0, y: 6, originalType: 'pawn', actualType: 'cannon', revealed: false, alive: true },
        { id: 'BLACK-KING', side: 'BLACK', x: 4, y: 0, originalType: 'king', actualType: 'king', revealed: true, alive: true },
      ],
      turn: 'RED', selectedId: null, gameOver: false, winner: null, seed: 'E2E-CAPTURE-HIDDEN',
    };
    await installState(page, state);
    await page.locator('[data-piece-id="RED-ROOK"]').click();
    await page.locator('[data-piece-id="BLACK-HIDDEN"]').click();
    await expect(page.locator('[data-piece-id="BLACK-HIDDEN"]')).toHaveCount(0);
    await expect(page.locator('#turnText')).toHaveText('黑方回合');
    await expect(page.locator('#log .log-entry').first()).toContainText('并吃子');
    await expect(page.locator('#log .log-entry').first()).not.toContainText('炮');
  });

  test('真实点击吃帅结束对局并展示胜负', async ({ page }) => {
    const state = {
      pieces: [
        { id: 'RED-ROOK', side: 'RED', x: 0, y: 9, originalType: 'rook', actualType: 'rook', revealed: true, alive: true },
        { id: 'BLACK-KING', side: 'BLACK', x: 0, y: 6, originalType: 'king', actualType: 'king', revealed: true, alive: true },
      ],
      turn: 'RED', selectedId: null, gameOver: false, winner: null, seed: 'E2E-GAME-OVER',
    };
    await installState(page, state);
    await page.locator('[data-piece-id="RED-ROOK"]').click();
    await page.locator('[data-piece-id="BLACK-KING"]').click();
    await expect(page.locator('#turnText')).toHaveText('红方获胜');
    await expect(page.locator('#phaseText')).toHaveText('对局结束');
    await expect(page.locator('#hintText')).toContainText('重新开局');
    await expect(page.locator('#moveCount')).toHaveText('1 手');
    await expect(page.locator('#log .log-entry').first()).toContainText('游戏结束');
  });
});