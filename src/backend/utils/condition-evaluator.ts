/**
 * Safe DSL condition evaluator
 * Replaces dangerous `new Function` pattern with deterministic evaluation
 */

type Value = string | number | boolean | null | undefined;
type Context = Record<string, Value>;

/**
 * Evaluates a condition string against a context object safely
 * Supports: ===, !==, >, <, >=, <=, &&, ||, ()
 * @param condition - Condition string (e.g., "capital_amount >= 5000000")
 * @param context - Data object with values
 * @returns boolean result
 */
export function evaluateCondition(condition: string, context: Context): boolean {
  try {
    // Normalize whitespace
    const normalized = condition.trim();
    
    // Handle empty condition
    if (!normalized) {
      return false;
    }

    // Parse and evaluate the expression
    return parseExpression(normalized, context);
  } catch (error) {
    console.error('Error evaluating condition:', condition, error);
    return false;
  }
}

function parseExpression(expr: string, context: Context): boolean {
  expr = expr.trim();

  // Handle parentheses - find matching pairs and evaluate recursively
  if (expr.includes('(')) {
    return evaluateWithParentheses(expr, context);
  }

  // Handle OR operator (lowest precedence)
  if (expr.includes('||')) {
    const parts = splitByOperator(expr, '||');
    return parts.some(part => parseExpression(part, context));
  }

  // Handle AND operator
  if (expr.includes('&&')) {
    const parts = splitByOperator(expr, '&&');
    return parts.every(part => parseExpression(part, context));
  }

  // Handle comparison operators
  return evaluateComparison(expr, context);
}

function evaluateWithParentheses(expr: string, context: Context): boolean {
  let result = expr;
  
  // Process innermost parentheses first
  while (result.includes('(')) {
    const lastOpen = result.lastIndexOf('(');
    const nextClose = result.indexOf(')', lastOpen);
    
    if (nextClose === -1) {
      throw new Error('Unmatched parentheses');
    }
    
    const inner = result.substring(lastOpen + 1, nextClose);
    const innerResult = parseExpression(inner, context);
    
    // Replace (expr) with result
    result = result.substring(0, lastOpen) + innerResult + result.substring(nextClose + 1);
  }
  
  return parseExpression(result, context);
}

function splitByOperator(expr: string, operator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let parenDepth = 0;
  let i = 0;

  while (i < expr.length) {
    if (expr[i] === '(') {
      parenDepth++;
      current += expr[i];
      i++;
    } else if (expr[i] === ')') {
      parenDepth--;
      current += expr[i];
      i++;
    } else if (parenDepth === 0 && expr.substring(i, i + operator.length) === operator) {
      parts.push(current.trim());
      current = '';
      i += operator.length;
    } else {
      current += expr[i];
      i++;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function evaluateComparison(expr: string, context: Context): boolean {
  expr = expr.trim();

  // Try each comparison operator in order of length (longest first)
  // Only strict equality operators (===, !==) are supported for type safety
  const operators = ['===', '!==', '>=', '<=', '>', '<'];
  
  for (const op of operators) {
    const index = findOperatorIndex(expr, op);
    if (index !== -1) {
      const left = expr.substring(0, index).trim();
      const right = expr.substring(index + op.length).trim();
      
      const leftValue = resolveValue(left, context);
      const rightValue = resolveValue(right, context);
      
      return compare(leftValue, rightValue, op);
    }
  }

  // No operator found - treat as boolean variable or literal
  return toBoolean(resolveValue(expr, context));
}

function findOperatorIndex(expr: string, operator: string): number {
  let parenDepth = 0;
  
  for (let i = 0; i < expr.length - operator.length + 1; i++) {
    if (expr[i] === '(') {
      parenDepth++;
    } else if (expr[i] === ')') {
      parenDepth--;
    } else if (parenDepth === 0 && expr.substring(i, i + operator.length) === operator) {
      return i;
    }
  }
  
  return -1;
}

function resolveValue(expr: string, context: Context): Value {
  expr = expr.trim();

  // Handle string literals
  if ((expr.startsWith("'") && expr.endsWith("'")) || 
      (expr.startsWith('"') && expr.endsWith('"'))) {
    return expr.slice(1, -1);
  }

  // Handle boolean literals
  if (expr === 'true') return true;
  if (expr === 'false') return false;

  // Handle null/undefined
  if (expr === 'null') return null;
  if (expr === 'undefined') return undefined;

  // Handle numbers
  if (/^-?\d+(\.\d+)?$/.test(expr)) {
    return parseFloat(expr);
  }

  // Handle variables from context
  if (expr in context) {
    return context[expr];
  }

  // Try to parse as nested property (e.g., "obj.prop")
  if (expr.includes('.')) {
    const parts = expr.split('.');
    let value: any = context;
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    return value as Value;
  }

  // Variable not found - treat as undefined
  return undefined;
}

function compare(left: Value, right: Value, operator: string): boolean {
  switch (operator) {
    case '===':
      return left === right;
    case '!==':
      return left !== right;
    case '>':
      return (left as number) > (right as number);
    case '<':
      return (left as number) < (right as number);
    case '>=':
      return (left as number) >= (right as number);
    case '<=':
      return (left as number) <= (right as number);
    default:
      throw new Error(`Unknown operator: ${operator}`);
  }
}

function toBoolean(value: Value): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    return value !== '';
  }
  // Check for null or undefined using strict null check
  return value !== null && value !== undefined;
}
