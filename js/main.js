import { initLogger } from './logger.js';
import { stabilizeMenuLoad } from './stabilize-menu.js';
import '../css/style.css';

async function bootstrap() {
  initLogger();
  stabilizeMenuLoad();

  const { initGameBootstrap } = await import('./game.js');
  initGameBootstrap();
}

bootstrap();
