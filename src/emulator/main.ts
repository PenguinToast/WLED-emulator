import "./style.css";
import { startApp } from "./app.js";

startApp().catch((error) => {
  console.error(error);
});
