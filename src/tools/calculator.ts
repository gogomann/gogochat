/**
 * Calculator Tool
 *
 * Einfacher Rechner für mathematische Operationen
 * KEINE Capability nötig - funktioniert immer offline
 */

import { ToolDefinition, ToolResult } from '../services/tool-registry';

export const calculatorTool: ToolDefinition = {
  name: 'calculator',
  description:
    'Führt mathematische Berechnungen aus. Nutze dies für Mathematik, Rechnen, Zahlen-Operationen. ' +
    'Unterstützt: +, -, *, /, %, ^, sqrt, sin, cos, tan, log',
  input_schema: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematischer Ausdruck zum Berechnen (z.B. "2 + 2", "sqrt(16)", "sin(45)")',
      },
    },
    required: ['expression'],
  },
  category: 'utility',
  // Keine requiredCapability - immer verfügbar!
};

/**
 * Calculator Handler - Führt mathematische Berechnungen aus
 */
export async function handleCalculator(input: { expression: string }): Promise<ToolResult> {
  try {
    const { expression } = input;

    // Sicherheit: Nur sichere Zeichen erlauben
    const safeExpression = expression.replace(/[^0-9+\-*/().%^ sqrtincoslag]/gi, '');

    // Math-Funktionen evaluieren
    let result: number;

    // Einfache Evaluation (in Production würde man eine Math-Library nutzen)
    if (safeExpression.includes('sqrt')) {
      const num = parseFloat(safeExpression.replace('sqrt(', '').replace(')', ''));
      result = Math.sqrt(num);
    } else if (safeExpression.includes('sin')) {
      const num = parseFloat(safeExpression.replace('sin(', '').replace(')', ''));
      result = Math.sin((num * Math.PI) / 180); // Grad → Radiant
    } else if (safeExpression.includes('cos')) {
      const num = parseFloat(safeExpression.replace('cos(', '').replace(')', ''));
      result = Math.cos((num * Math.PI) / 180);
    } else if (safeExpression.includes('tan')) {
      const num = parseFloat(safeExpression.replace('tan(', '').replace(')', ''));
      result = Math.tan((num * Math.PI) / 180);
    } else if (safeExpression.includes('log')) {
      const num = parseFloat(safeExpression.replace('log(', '').replace(')', ''));
      result = Math.log10(num);
    } else {
      // Einfache Arithmetik mit Function (VORSICHT: Sicherheitsrisiko in Production!)
      // In Production: math.js oder ähnliche Library nutzen
      result = Function(`'use strict'; return (${safeExpression})`)();
    }

    return {
      success: true,
      data: {
        expression: expression,
        result: result,
        formatted: `${expression} = ${result}`,
      },
      mediaType: 'text',
    };
  } catch (error: any) {
    return {
      success: false,
      data: null,
      error: `Calculation error: ${error.message}`,
    };
  }
}
