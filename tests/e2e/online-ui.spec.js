import { test, expect } from '@playwright/test';

async function enterOnline(page) {
  await page.goto('/?mode=online&e2e=online-ui');
  await expect(page.getByTestId('mode-online')).toHaveClass(/active/);
}

async function createRoom(page) {
  await enterOnline(page);
  await page.getByTestId('create-room').click();
  await expect(page.getByTestId('network-status')).toContainText('已连接');
  const roomId = await page.getByTestId('room-code').textContent();
  expect(roomId).toMatch(/^[A-Z0-9]{8}$/);
  return roomId;
}

async function joinRoom(page, roomId) {
  await enterOnline(page);
  await page.getByTestId('room-input').fill(roomId);
  await page.getByTestId('join-room').click();
  await expect(page.getByTestId('network-status')).toContainText('已连接');
}

test.describe('第三阶段：联网棋盘 UI', () => {
  test('创建房间 → 显示房间号 → 另一浏览器加入', async ({ browser }) => {
    const redContext = await browser.newContext();
    const blackContext = await browser.newContext();
    const red = await redContext.newPage();
    const black = await blackContext.newPage();

    const roomId = await createRoom(red);
    await expect(red.getByTestId('waiting-text')).toBeVisible();
    await expect(red.getByTestId('player-side')).toHaveText('红方');

    await joinRoom(black, roomId);
    await expect(black.getByTestId('player-side')).toHaveText('黑方');

    await expect(red.locator('[data-testid="board"] .piece')).toHaveCount(32);
    await expect(black.locator('[data-testid="board"] .piece')).toHaveCount(32);
    await expect(red.getByTestId('waiting-text')).toBeHidden();
    await expect(black.getByTestId('waiting-text')).toBeHidden();

    await redContext.close();
    await blackContext.close();
  });

  test('双方通过真实棋盘点击在线翻棋与落子，并保持相同回合数', async ({ browser }) => {
    const redContext = await browser.newContext();
    const blackContext = await browser.newContext();
    const red = await redContext.newPage();
    const black = await blackContext.newPage();

    const roomId = await createRoom(red);
    await joinRoom(black, roomId);
    await expect(red.locator('[data-testid="board"] .piece.red.hidden')).toHaveCount(15);
    await expect(black.locator('[data-testid="board"] .piece.black.hidden')).toHaveCount(15);

    await red.locator('[data-testid="board"] .piece.red.hidden').first().click();
    await expect(red.getByTestId('reveal')).toBeEnabled();
    await red.getByTestId('reveal').click();
    await expect(red.getByTestId('turnText')).toHaveText('黑方回合');
    await expect(black.getByTestId('turnText')).toHaveText('黑方回合');
    await expect(red.getByTestId('moveCount')).toHaveText('1 手');
    await expect(black.getByTestId('moveCount')).toHaveText('1 手');

    const blackHidden = black.locator('[data-testid="board"] .piece.black.hidden').first();
    await blackHidden.click();
    await expect(black.locator('.target-cell')).not.toHaveCount(0);
    const target = black.locator('.target-cell').first();
    await target.click();

    await expect(red.getByTestId('moveCount')).toHaveText('2 手');
    await expect(black.getByTestId('moveCount')).toHaveText('2 手');
    await expect(red.getByTestId('turnText')).toHaveText('红方回合');
    await expect(black.getByTestId('turnText')).toHaveText('红方回合');
    await expect(red.getByTestId('network-status')).toContainText('已连接');
    await expect(black.getByTestId('network-status')).toContainText('已连接');

    await redContext.close();
    await blackContext.close();
  });

  test('断线 → 页面提示 → 点击重新连接 → 房间与棋局状态保留', async ({ browser }) => {
    const redContext = await browser.newContext();
    const blackContext = await browser.newContext();
    const red = await redContext.newPage();
    const black = await blackContext.newPage();

    const roomId = await createRoom(red);
    await joinRoom(black, roomId);

    await red.locator('[data-testid="board"] .piece.red.hidden').first().click();
    await red.getByTestId('reveal').click();
    await expect(red.getByTestId('moveCount')).toHaveText('1 手');
    await expect(black.getByTestId('moveCount')).toHaveText('1 手');

    const originalSide = await red.getByTestId('player-side').textContent();
    await red.evaluate(() => window.__DARK_CHESS_E2E_NETWORK_DISCONNECT__?.());
    await expect(red.getByTestId('network-status')).toContainText('已断开', { timeout: 5_000 });

    await expect(red.getByTestId('reconnect')).toBeVisible();
    await red.getByTestId('reconnect').click();
    await expect(red.getByTestId('network-status')).toContainText('已连接', { timeout: 5_000 });
    await expect(red.getByTestId('player-side')).toHaveText(originalSide);
    await expect(red.getByTestId('room-code')).toHaveText(roomId);
    await expect(red.getByTestId('moveCount')).toHaveText('1 手');

    await redContext.close();
    await blackContext.close();
  });
});
