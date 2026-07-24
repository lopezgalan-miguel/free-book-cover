/**
 * CONTRATO · Componente raíz
 * --------------------------
 * Decide qué vista se muestra. En este primer nivel solo existe <Home />.
 * Cuando haya navegación (varias vistas / rutas), este es el sitio donde vive
 * el enrutado. Sin lógica de dominio: solo composición de vistas.
 */

import { Home } from '@/views/Home/Home';

const App = () => {
  return <Home />;
};

export default App;
