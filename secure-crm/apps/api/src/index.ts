import { initSchema } from './db';
import { app } from './app';

initSchema();

const PORT = Number(process.env.API_PORT || 4000);

app.listen(PORT, () => {
  console.log(`API secure-crm escuchando en http://localhost:${PORT}`);
});
