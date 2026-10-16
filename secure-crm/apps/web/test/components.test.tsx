// Componentes de presentación: ui.tsx, brand.tsx y charts.tsx.
import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button, Card, Field, Input, PriorityPill, RoleBadge, StatusPill, inputCls } from '@/components/ui';
import { BrandPair, Logo, UvgLogo, Wordmark } from '@/components/brand';
import { BarRow, StatusDonut } from '@/components/charts';

describe('ui', () => {
  test('Button aplica variante y tamaño, y reenvía props y eventos', () => {
    const onClick = vi.fn();
    render(
      <>
        <Button onClick={onClick}>Primario</Button>
        <Button variant="danger" size="sm" className="extra" disabled>
          Borrar
        </Button>
      </>
    );
    const primary = screen.getByRole('button', { name: 'Primario' });
    expect(primary.className).toContain('bg-uvg-green');
    expect(primary.className).toContain('h-10');
    fireEvent.click(primary);
    expect(onClick).toHaveBeenCalledOnce();
    const danger = screen.getByRole('button', { name: 'Borrar' });
    expect(danger.className).toMatch(/bg-red-600.*extra|extra.*bg-red-600/);
    expect(danger.className).toContain('h-8');
    expect((danger as HTMLButtonElement).disabled).toBe(true);
  });

  test('Card y Field renderizan contenido, etiqueta y pista opcional', () => {
    render(
      <Card className="p-4">
        <Field label="Asunto" hint="Máximo 200 caracteres">
          <span>hijo</span>
        </Field>
        <Field label="Sin pista">
          <span>otro</span>
        </Field>
      </Card>
    );
    expect(screen.getByText('hijo').closest('div')?.className).toContain('p-4');
    expect(screen.getByText('Máximo 200 caracteres')).toBeTruthy();
    expect(screen.getByText('Sin pista').parentElement?.querySelectorAll('span')).toHaveLength(2);
  });

  test('Input usa los estilos comunes y conserva los props recibidos', () => {
    const onChange = vi.fn();
    render(<Input placeholder="Usuario" defaultValue="ana" onChange={onChange} />);
    const input = screen.getByPlaceholderText('Usuario') as HTMLInputElement;
    expect(input.className).toBe(inputCls);
    expect(input.value).toBe('ana');
    fireEvent.change(input, { target: { value: 'ana2' } });
    expect(onChange).toHaveBeenCalled();
  });

  test('las píldoras traducen valores conocidos y muestran los desconocidos tal cual', () => {
    render(
      <>
        <StatusPill status="in_progress" />
        <StatusPill status="raro" />
        <PriorityPill priority="urgent" />
        <PriorityPill priority="otra" />
        <RoleBadge role="admin" />
        <RoleBadge role="desconocido" />
      </>
    );
    expect(screen.getByText('En progreso').className).toContain('bg-amber-50');
    expect(screen.getByText('raro').className).toContain('bg-slate-100');
    expect(screen.getByText('Urgente').className).toContain('bg-red-50');
    expect(screen.getByText('otra').className).toContain('bg-slate-100');
    expect(screen.getByText('admin').className).toContain('bg-uvg-mint/25');
    expect(screen.getByText('desconocido').className).toContain('bg-white/10');
  });
});

describe('brand', () => {
  test('logos con clases por defecto y personalizadas', () => {
    render(
      <>
        <Logo />
        <UvgLogo />
        <UvgLogo variant="ink" className="h-4" />
      </>
    );
    expect(screen.getByAltText('Secure CRM').className).toBe('h-8 w-auto');
    const [white, ink] = screen.getAllByAltText('Universidad del Valle de Guatemala') as HTMLImageElement[];
    expect(white.getAttribute('src')).toBe('/brand/uvg.png');
    expect(ink.getAttribute('src')).toBe('/brand/uvg-ink.png');
    expect(ink.className).toBe('h-4');
  });

  test('Wordmark muestra el subtítulo solo si se indica', () => {
    const { container, rerender } = render(<Wordmark />);
    expect(container.querySelectorAll('span')).toHaveLength(0);
    rerender(<Wordmark subtitle="Laboratorio OWASP" />);
    expect(screen.getByText('Laboratorio OWASP')).toBeTruthy();
  });

  test('BrandPair combina ambos logos', () => {
    const { container } = render(<BrandPair className="par" logoClassName="a" uvgClassName="b" />);
    expect((container.firstChild as HTMLElement).className).toContain('par');
    expect(screen.getByAltText('Secure CRM').className).toBe('a');
    expect(screen.getByAltText('Universidad del Valle de Guatemala').className).toBe('b');
  });

  test('BrandPair usa tamaños por defecto', () => {
    render(<BrandPair />);
    expect(screen.getByAltText('Secure CRM').className).toBe('h-7 w-auto');
  });
});

describe('charts', () => {
  test('StatusDonut dibuja un anillo por serie y su leyenda', () => {
    const { container } = render(
      <StatusDonut
        data={[
          { label: 'Abiertos', value: 3, color: '#00f' },
          { label: 'Cerrados', value: 1, color: '#0f0' },
        ]}
      />
    );
    expect(container.querySelectorAll('circle')).toHaveLength(3);
    expect(screen.getByText('Abiertos')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  test('StatusDonut tolera un total de cero', () => {
    const { container } = render(<StatusDonut data={[{ label: 'Vacío', value: 0, color: '#000' }]} />);
    expect(container.querySelectorAll('circle')).toHaveLength(2);
  });

  test('BarRow muestra etiqueta y valor, incluso con máximo cero', () => {
    render(
      <>
        <BarRow label="Ana" value={2} max={4} color="#123" />
        <BarRow label="Nadie" value={0} max={0} color="#456" />
      </>
    );
    expect(screen.getByText('Ana').parentElement?.textContent).toContain('2');
    expect(screen.getByText('Nadie').parentElement?.textContent).toContain('0');
  });
});
