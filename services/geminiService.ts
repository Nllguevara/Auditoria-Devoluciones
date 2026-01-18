
import { GoogleGenAI, Type } from "@google/genai";
import { VerificationReport, ClientValidationResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Valida la foto del cliente extrayendo metadatos.
 * Optimizado para extracción de datos de etiquetas.
 */
export const validateClientImage = async (base64: string): Promise<ClientValidationResult> => {
  const model = "gemini-3-flash-preview";
  const prompt = `
    Extrae los datos de esta etiqueta de envío. 
    Campos requeridos: shippingNumber, ean, ql, brand, color, size, vendorSize, description.
    Si un campo no es visible, usa "No detectado".
    Devuelve estrictamente JSON.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        { text: prompt },
        { inlineData: { mimeType: "image/jpeg", data: base64.split(',')[1] } }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isValid: { type: Type.BOOLEAN, description: "True si se encuentra al menos el número de envío" },
          missingFields: { type: Type.ARRAY, items: { type: Type.STRING } },
          detectedData: {
            type: Type.OBJECT,
            properties: {
              shippingNumber: { type: Type.STRING },
              ean: { type: Type.STRING },
              ql: { type: Type.STRING },
              brand: { type: Type.STRING },
              color: { type: Type.STRING },
              size: { type: Type.STRING },
              vendorSize: { type: Type.STRING },
              description: { type: Type.STRING }
            },
            required: ["shippingNumber", "ean", "ql", "brand", "color", "size", "vendorSize", "description"]
          }
        },
        required: ["isValid", "missingFields", "detectedData"]
      }
    }
  });

  return JSON.parse(response.text || "{}") as ClientValidationResult;
};

/**
 * Realiza verificación profunda siguiendo el protocolo estricto de peritaje.
 */
export const verifyImages = async (
  clientImageBase64: string,
  returnImagesBase64: string[]
): Promise<VerificationReport> => {
  const model = "gemini-3-pro-preview";
  
  const clientPart = {
    inlineData: {
      mimeType: "image/jpeg",
      data: clientImageBase64.split(',')[1],
    },
  };

  const returnParts = returnImagesBase64.map((base64) => ({
    inlineData: {
      mimeType: "image/jpeg",
      data: base64.split(',')[1],
    },
  }));

  const prompt = `
    Actúa como perito experto en control de calidad textil. Realiza un peritaje siguiendo estrictamente este protocolo:

    1. CÓDIGO EAN / REFERENCIA:
    - Tarea: Compara el código EAN de la etiqueta con referencias visibles en la prenda.
    - Criterio: Si los números coinciden o la prenda corresponde claramente a esa referencia, estado "OK". De lo contrario "WARNING".

    2. APARIENCIA Y AUTENTICIDAD:
    - Tarea: Verifica que modelo, marca (ej. Vero Moda), color (ej. negro) y logotipos en la devolución coincidan con la etiqueta.
    - Criterio: Si todo es consistente, estado "OK". Si hay discrepancias, estado "WARNING".

    3. ESTADO E INTEGRIDAD (PUNTO CRÍTICO):
    - Tarea: Inspección visual minuciosa buscando:
      * Manchas: Suciedad, maquillaje, fluidos.
      * Desgarros/Roturas: Agujeros, costuras abiertas, hilos sueltos.
      * Signos de Uso: Arrugas excesivas, falta de etiquetas interiores de composición, rastro visual de olores o desgaste.
      * Manipulación: Intentos de reparación o etiquetas quitadas agresivamente.
    - CRITERIO DE COHERENCIA: Si la prenda está IMPECABLE, el estado es "OK". Si detectas CUALQUIER fallo visual de los anteriores, el estado DEBE ser "WARNING". No puedes decir "no hay daños" y poner "WARNING", ni viceversa.

    Idioma: Castellano.
    Asegúrate de que 'damageDetected' sea WARNING si mencionas cualquier anomalía en 'damageDetails'.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [{ text: prompt }, clientPart, ...returnParts],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          eanMatch: { type: Type.STRING, enum: ["OK", "WARNING"] },
          visualMatch: { type: Type.STRING, enum: ["OK", "WARNING"] },
          damageDetected: { type: Type.STRING, enum: ["OK", "WARNING"], description: "WARNING si hay manchas, roturas, uso o manipulación." },
          eanDetails: { type: Type.STRING },
          clientEan: { type: Type.STRING },
          returnEan: { type: Type.STRING },
          shippingNumber: { type: Type.STRING },
          visualDetails: { type: Type.STRING },
          damageDetails: { type: Type.STRING },
          summary: { type: Type.STRING },
        },
        required: ["eanMatch", "visualMatch", "damageDetected", "eanDetails", "clientEan", "returnEan", "shippingNumber", "visualDetails", "damageDetails", "summary"],
      },
    }
  });

  return JSON.parse(response.text || "{}") as VerificationReport;
};
