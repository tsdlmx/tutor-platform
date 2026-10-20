package identity

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"math/big"

	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

// The administrator login code is rendered here rather than delegated to the
// legacy service so the migrated login flow has no dependency on Java.
const (
	captchaAlphabet  = "abcdefghjkmnpqrstuvwxyz23456789"
	captchaLength    = 4
	captchaScale     = 3
	captchaSourceW   = 78
	captchaSourceH   = 28
	captchaCharGap   = 18
	captchaCharLeft  = 6
	captchaBaseline  = 19
	captchaJitterMax = 2
)

// IssueCaptcha stores a single-use verification code and returns the identifier
// that must be submitted with the answer, plus a data URI for the image.
func (s *Service) IssueCaptcha(ctx context.Context) (string, string, error) {
	code, err := randomCaptchaText(captchaLength)
	if err != nil {
		return "", "", err
	}
	identifier, err := randomHex(16)
	if err != nil {
		return "", "", err
	}
	encoded, err := renderCaptchaImage(code)
	if err != nil {
		return "", "", err
	}
	if err := s.redis.Set(ctx, adminCaptchaKeyPrefix+identifier, code, adminCaptchaTTL).Err(); err != nil {
		return "", "", fmt.Errorf("store captcha: %w", err)
	}
	return identifier, encoded, nil
}

func randomCaptchaText(length int) (string, error) {
	alphabet := []byte(captchaAlphabet)
	result := make([]byte, length)
	for i := range result {
		index, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		if err != nil {
			return "", fmt.Errorf("generate captcha text: %w", err)
		}
		result[i] = alphabet[index.Int64()]
	}
	return string(result), nil
}

// renderCaptchaImage draws the code into a small canvas, adds noise, and then
// scales it up so the glyphs stay legible in the login form.
func renderCaptchaImage(code string) (string, error) {
	canvas := image.NewRGBA(image.Rect(0, 0, captchaSourceW, captchaSourceH))
	background := color.RGBA{R: 248, G: 249, B: 251, A: 255}
	fillRect(canvas, 0, 0, captchaSourceW, captchaSourceH, background)

	for i := 0; i < len(code); i++ {
		offsetX, err := randomInRange(-captchaJitterMax, captchaJitterMax)
		if err != nil {
			return "", err
		}
		offsetY, err := randomInRange(-captchaJitterMax, captchaJitterMax)
		if err != nil {
			return "", err
		}
		drawer := &font.Drawer{
			Dst:  canvas,
			Src:  image.NewUniform(randomDark(mustRandom(80, 150))),
			Face: basicfont.Face7x13,
			Dot: fixed.Point26_6{
				X: fixed.I(captchaCharLeft + i*captchaCharGap + offsetX),
				Y: fixed.I(captchaBaseline + offsetY),
			},
		}
		drawer.DrawString(string(code[i]))
	}

	// Scatter light speckles so a simple background subtraction does not reveal
	// the glyphs.
	for i := 0; i < 160; i++ {
		x, err := randomInRange(0, captchaSourceW-1)
		if err != nil {
			return "", err
		}
		y, err := randomInRange(0, captchaSourceH-1)
		if err != nil {
			return "", err
		}
		canvas.Set(x, y, randomDark(mustRandom(170, 225)))
	}

	scaled := scaleNearest(canvas, captchaScale)
	width, height := scaled.Bounds().Dx(), scaled.Bounds().Dy()
	for i := 0; i < 3; i++ {
		x0, err := randomInRange(0, width-1)
		if err != nil {
			return "", err
		}
		y0, err := randomInRange(0, height-1)
		if err != nil {
			return "", err
		}
		x1, err := randomInRange(0, width-1)
		if err != nil {
			return "", err
		}
		y1, err := randomInRange(0, height-1)
		if err != nil {
			return "", err
		}
		drawLine(scaled, x0, y0, x1, y1, randomDark(mustRandom(140, 200)))
	}

	var buffer bytes.Buffer
	if err := png.Encode(&buffer, scaled); err != nil {
		return "", fmt.Errorf("encode captcha image: %w", err)
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buffer.Bytes()), nil
}

func randomInRange(minimum, maximum int) (int, error) {
	if maximum <= minimum {
		return minimum, nil
	}
	value, err := rand.Int(rand.Reader, big.NewInt(int64(maximum-minimum+1)))
	if err != nil {
		return 0, fmt.Errorf("generate captcha noise: %w", err)
	}
	return minimum + int(value.Int64()), nil
}

func mustRandom(minimum, maximum int) int {
	value, err := randomInRange(minimum, maximum)
	if err != nil {
		return minimum
	}
	return value
}

func randomDark(maximum int) color.RGBA {
	return color.RGBA{
		R: uint8(mustRandom(20, maximum/2)),
		G: uint8(mustRandom(20, maximum/2)),
		B: uint8(mustRandom(40, maximum)),
		A: 255,
	}
}

func fillRect(img *image.RGBA, left, top, right, bottom int, fill color.RGBA) {
	for y := top; y < bottom; y++ {
		for x := left; x < right; x++ {
			img.Set(x, y, fill)
		}
	}
}

func scaleNearest(source *image.RGBA, factor int) *image.RGBA {
	bounds := source.Bounds()
	target := image.NewRGBA(image.Rect(0, 0, bounds.Dx()*factor, bounds.Dy()*factor))
	for y := 0; y < bounds.Dy()*factor; y++ {
		for x := 0; x < bounds.Dx()*factor; x++ {
			target.Set(x, y, source.At(x/factor, y/factor))
		}
	}
	return target
}

func drawLine(img *image.RGBA, x0, y0, x1, y1 int, stroke color.RGBA) {
	deltaX, deltaY := absInt(x1-x0), -absInt(y1-y0)
	stepX := -1
	if x0 < x1 {
		stepX = 1
	}
	stepY := -1
	if y0 < y1 {
		stepY = 1
	}
	err := deltaX + deltaY
	for {
		img.Set(x0, y0, stroke)
		if x0 == x1 && y0 == y1 {
			return
		}
		double := 2 * err
		if double >= deltaY {
			err += deltaY
			x0 += stepX
		}
		if double <= deltaX {
			err += deltaX
			y0 += stepY
		}
	}
}

func absInt(value int) int {
	if value < 0 {
		return -value
	}
	return value
}
