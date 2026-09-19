import { test, expect } from '@playwright/test';

async function waitForNetworkSession(page) {
  return page.waitForFunction(() => Boolean(window.__DARK_CHESS_E2E_NETWORK__?.ready));
}

test('两浏览器上下文：同房间、不同视图、revision 同步、断线重连', async ({ browser, baseURL }) => {
  const redContext = await browser.newContext();
  const blackContext = await browser.newContext();
  const red = await redContext.newPage();
  const black = await blackContext.newPage();

  await red.goto(baseURL + '/?e2e=network');
  await waitForNetworkSession(red);

  const roomInfo = await red.evaluate(() => window.__DARK_CHESS_E2E_NETWORK__.info());
  await black.goto(baseURL + '/?e2e=network&room=' + encodeURIComponent(roomInfo.roomId));
  await waitForNetworkSession(black);

  await red.waitForFunction(() => window.__DARK_CHESS_E2E_NETWORK__.getView()?.pieces?.length === 32);
  await black.waitForFunction(() => window.__DARK_CHESS_E2E_NETWORK__.getView()?.pieces?.length === 32);

  const initial = await red.evaluate(() => window.__DARK_CHESS_E2E_NETWORK__.getView());
  expect(initial.playerSide).toBe('RED');
  expect(initial.revision).toBe(0);

  const hiddenId = initial.pieces.find(piece => piece.side === 'RED' && !piece.revealed).id;
  await red.evaluate(id => window.__DARK_CHESS_E2E_NETWORK__.reveal(id), hiddenId);

  await red.waitForFunction(() => window.__DARK_CHESS_E2E_NETWORK__.getView()?.revision === 1);
  await black.waitForFunction(() => window.__DARK_CHESS_E2E_NETWORK__.getView()?.revision === 1);

  const afterRed = await red.evaluate(() => window.__DARK_CHESS_E2E_NETWORK__.getView());
  const afterBlack = await black.evaluate(() => window.__DARK_CHESS_E2E_NETWORK__.getView());

  expect(afterRed.playerSide).toBe('RED');
  expect(afterBlack.playerSide).toBe('BLACK');
  expect(afterRed.revision).toBe(1);
  expect(afterBlack.revision).toBe(1);
  expect(afterRed.pieces.some(piece => piece.id === afterRed.pieces.find(p => p.revealed && p.side === 'RED')?.id)).toBeTruthy();

  const redHiddenOpponent = afterRed.pieces.find(piece => piece.side === 'BLACK' && !piece.revealed);
  const blackHiddenSelf = afterBlack.pieces.find(piece => piece.side === 'BLACK' && !piece.revealed);
  expect(redHiddenOpponent).toBeTruthy();
  expect(blackHiddenSelf).toBeTruthy();
  expect(Object.hasOwn(redHiddenOpponent, 'actualType')).toBeFalsy();
  expect(Object.hasOwn(blackHiddenSelf, 'actualType')).toBeFalsy();

  const blackPiece = afterBlack.pieces.find(piece => piece.side === 'BLACK' && !piece.revealed);
  expect(blackPiece).toBeTruthy();
  const blackTargets = await black.evaluate(id => window.__DARK_CHESS_E2E_NETWORK__.legalTargets(id), blackPiece.id);
  expect(blackTargets.length).toBeGreaterThan(0);
  const target = blackTargets[0];
  await black.evaluate(({ id, target }) => window.__DARK_CHESS_E2E_NETWORK__.move(id, target.x, target.y), {
    id: blackPiece.id,
    target,
  });

  await red.waitForFunction(() => window.__DARK_CHESS_E2E_NETWORK__.getView()?.revision === 2);
  await black.waitForFunction(() => window.__DARK_CHESS_E2E_NETWORK__.getView()?.revision === 2);

  const afterMoveRed = await red.evaluate(() => window.__DARK_CHESS_E2E_NETWORK__.getView());
  const movedBlack = afterMoveRed.pieces.find(piece => piece.id === blackPiece.id);
  expect(movedBlack).toBeTruthy();
  expect(movedBlack.revealed).toBe(true);
  expect(Object.hasOwn(movedBlack, 'actualType')).toBeTruthy();
  expect(afterMoveRed.pieces.filter(piece => !piece.revealed).every(piece => !Object.hasOwn(piece, 'actualType'))).toBeTruthy();

  const resync = await red.evaluate(() => window.__DARK_CHESS_E2E_NETWORK__.resync());
  expect(resync.type).toBe('game.resync');
  expect(resync.revision).toBe(2);

  await red.evaluate(() => window.__DARK_CHESS_E2E_NETWORK__.disconnect());
  await red.waitForFunction(() => window.__DARK_CHESS_E2E_NETWORK__.connected === false);

  await red.evaluate(() => window.__DARK_CHESS_E2E_NETWORK__.reconnect());
  await red.waitForFunction(() => window.__DARK_CHESS_E2E_NETWORK__.connected === true);
  await red.waitForFunction(() => window.__DARK_CHESS_E2E_NETWORK__.getView()?.revision === 1);

  const reconnected = await red.evaluate(() => window.__DARK_CHESS_E2E_NETWORK__.getView());
  expect(reconnected.playerSide).toBe('RED');
  expect(reconnected.revision).toBe(1);

  await redContext.close();
  await blackContext.close();
});
