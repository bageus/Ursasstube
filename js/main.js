import { initLogger } from './logger.js';
import { initDomState } from './state.js';
import { stabilizeMenuLoad } from './stabilize-menu.js';
import '../css/style.css';

async function bootstrap() {
  initLogger();
  initDomState();
  stabilizeMenuLoad();

  const { initGameBootstrap } = await import('./game-runtime.js');
  initGameBootstrap();
}

bootstrap();
