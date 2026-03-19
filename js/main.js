import { initLogger } from './logger.js';
import { stabilizeMenuLoad } from './stabilize-menu.js';

async function bootstrap() {
  initLogger();
  stabilizeMenuLoad();

  const { initGameBootstrap } = await import('./game.js');
  initGameBootstrap();
}

bootstrap();
